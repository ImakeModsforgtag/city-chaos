import asyncio, math
from playwright.async_api import async_playwright
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
H = open(__import__('os').path.join(__import__('os').path.dirname(__file__), 'quest3_prison_test.py')).read().split('H = """')[1].split('"""')[0]
PLACE = """(x, y, z) => { const cc = __cc; const h = cc.camera.getWorldPosition(new cc.camera.position.constructor()); cc.rig.position.x += x - h.x; cc.rig.position.z += z - h.z; cc.rig.position.y += (y + 0.9) - h.y; cc.vrMover.reset(); }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        errs=[]
        b2 = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)   # separate browser so neither tab gets throttled
        A = await b.new_page(viewport={'width':900,'height':560}); B = await b2.new_page(viewport={'width':900,'height':560})
        for t,pg in (('A',A),('B',B)): pg.on('pageerror', lambda e, t=t: errs.append(t+': '+str(e)))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.evaluate("document.querySelector('.role-seg button[data-val=cop]').click()")
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(800)
        code = await A.inner_text('#lobby-code')
        await B.goto(f'http://localhost:3000/vr-test.html?room={code}'); await B.wait_for_timeout(2500)
        await B.evaluate("document.querySelector('.role-seg button[data-val=cop]').click()")
        await B.click('[data-action=join]'); await B.wait_for_timeout(800)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(400)
        # A takes a parked police-free car: pick an NPC car and stand at its door
        await A.bring_to_front()
        # both players are cops here (cops drive the parked police cars freely, so nobody shoots at the driver mid-test)
        c = await A.evaluate('(() => { const c = [...__cc.cars.map.values()].find(c => c.police && c.driverKind === 2); const d = __cc.cars.doorWorld(c); return [c.id, d.x, d.z]; })()')
        await A.evaluate(f'__cc.walker.feet.set({c[1]}, 0.3, {c[2]}); __cc.walker.vel.set(0,0,0)'); await A.wait_for_timeout(1500)
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(900)
        print('A driving:', await A.evaluate('__cc.driving.active'))
        car = await A.evaluate('[__cc.driving.car.id, __cc.driving.car.x, __cc.driving.car.z, __cc.driving.car.yaw]')
        # B enters VR and walks up to the car
        await B.bring_to_front(); await B.evaluate(H)
        await B.evaluate("__xr.position.set(0, 1.65, 0); __hands([-0.25, 0.75, -0.1], [0.25, 0.75, -0.1])")
        await B.click('[data-action=vr]'); await B.wait_for_timeout(1800)
        rx, rz = car[1] + math.cos(car[3]) * 2.0, car[2] - math.sin(car[3]) * 2.0
        await B.evaluate(f"({PLACE})({rx}, 0.15, {rz})"); await B.wait_for_timeout(7000)   # let the server accept the long move
        await B.evaluate(f"""(() => {{ const c = __cc.cars.get({car[0]}); __cc.rig.updateMatrixWorld(true); const v = new __cc.camera.position.constructor(c.x, c.y + 1.0, c.z); __cc.rig.worldToLocal(v); __xr.controllers.right.position.set(v.x, v.y, v.z); }})()""")
        await B.wait_for_timeout(500)
        await B.evaluate("window.__m=[]; for (const t of ['pMsg','carRide','carEnter']) __cc.net.on(t, m => __m.push(JSON.stringify(m)))")
        print('B (VR) prompt next to the moving getaway car:', await B.evaluate('__cc.G.prompt'))
        await B.evaluate("__xr.controllers.right.updateButtonValue('squeeze', 1)"); await B.wait_for_timeout(500)
        await B.evaluate("__xr.controllers.right.updateButtonValue('squeeze', 0)"); await B.wait_for_timeout(900)
        await B.evaluate("__hands([-0.25, 0.75, -0.3], [0.25, 0.75, -0.3])")
        print('B msgs after grip:', await B.evaluate('__m'))
        await B.evaluate(f"__cc.net.send({{ type: 'hijack', id: {car[0]} }})"); await B.wait_for_timeout(800)
        print('B msgs:', await B.evaluate('__m'), 'server dist check: B pose sent?', await B.evaluate('__cc.G.me.life'))
        print('B riding:', await B.evaluate('JSON.stringify(__cc.G.ride)'), '| A knows:', await A.evaluate('JSON.stringify([...__cc.G.riders])'))
        # A drives forward 2 s; B (in background) must follow the car
        await A.bring_to_front(); p0 = await A.evaluate('[__cc.driving.car.x, __cc.driving.car.z]')
        await A.keyboard.down('KeyW'); await A.wait_for_timeout(3000); await A.keyboard.up('KeyW'); await A.wait_for_timeout(600)
        p1 = await A.evaluate('[__cc.driving.car.x, __cc.driving.car.z]'); print('A drove the car', round(math.hypot(p1[0]-p0[0], p1[1]-p0[1]), 1), 'm', '| view', await A.evaluate('__cc.G.view'))
        await A.screenshot(path='/tmp/shots/r_driver_view.png')
        await B.bring_to_front(); await B.wait_for_timeout(1500)
        d = await B.evaluate(f"""(() => {{ const c = __cc.cars.get({car[0]}); const h = __cc.camera.getWorldPosition(new __cc.camera.position.constructor()); return [+Math.hypot(h.x - c.x, h.z - c.z).toFixed(2), +h.y.toFixed(2), +Math.hypot(c.x - {car[1]}, c.z - {car[2]}).toFixed(1)]; }})()""")
        print('B head distance from car center:', d[0], 'm | head height', d[1], '| car moved', d[2], 'm')
        await B.screenshot(path='/tmp/shots/r_passenger_vr.png')
        # B shoots from the car
        shots0 = await B.evaluate('JSON.stringify(__cc.weapons.slots.map(s => s.mag))')
        await B.evaluate("__xr.controllers.right.updateButtonValue('trigger', 1)"); await B.wait_for_timeout(300)
        await B.evaluate("__xr.controllers.right.updateButtonValue('trigger', 0)"); await B.wait_for_timeout(400)
        print('B fired from the car (ammo', shots0, '->', await B.evaluate('JSON.stringify(__cc.weapons.slots.map(s => s.mag))'), ')')
        # A sees B's avatar in the car
        await A.bring_to_front(); await A.wait_for_timeout(1200)
        av = await A.evaluate(f"""(() => {{ const c = __cc.cars.get({car[0]}); for (const q of __cc.remote.players.values()) {{ const p = q.avatar.head.getWorldPosition(new __cc.camera.position.constructor()); return +Math.hypot(p.x - c.x, p.z - c.z).toFixed(2); }} }})()""")
        print('A sees the avatar of B this far from the car center:', av, 'm')
        # B gets out with B
        await B.bring_to_front()
        await B.evaluate("__xr.controllers.right.updateButtonValue('b-button', 1)"); await B.wait_for_timeout(250)
        await B.evaluate("__xr.controllers.right.updateButtonValue('b-button', 0)"); await B.wait_for_timeout(900)
        print('B out of the car:', await B.evaluate('!__cc.G.ride'))
        print('ERRORS:', errs)
        await b.close()
asyncio.run(main())
