# Emulated Meta Quest 3 (IWER) test: robbery -> arrested in VR -> seated back-seat ride -> B to skip -> prison grip interaction.
# Needs public/vr-test.html + public/vendor/iwer-test.js (see quest3_emulated_vr_test.py for how to create them).
import asyncio, math
from playwright.async_api import async_playwright
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
H = """
window.__sleep = (ms) => new Promise(r => setTimeout(r, ms));
window.__hands = (l, r) => { const c = __xr.controllers; c.left.position.set(...l); c.right.position.set(...r); };
window.__place = (x, y, z, yaw) => { const cc = __cc; cc.rig.position.set(x, y, z); cc.rig.rotation.set(0, yaw, 0); cc.vrMover.reset(); };
window.__frames = (n, fn) => new Promise(res => { let f = 0; window.__frameHook = () => { if (f >= n) { window.__frameHook = null; res(); return; } fn(f++); }; });
window.__r = () => { const p = __cc.rig.position; return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]; };
0;
"""
PLACE = """(x, y, z) => { const cc = __cc; const h = cc.camera.getWorldPosition(new cc.camera.position.constructor()); cc.rig.position.x += x - h.x; cc.rig.position.z += z - h.z; cc.rig.position.y += (y + 0.9) - h.y; cc.vrMover.reset(); }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        errs=[]
        A = await b.new_page(viewport={'width':800,'height':500}); B = await b.new_page(viewport={'width':800,'height':500})
        for t,pg in (('A',A),('B',B)): pg.on('pageerror', lambda e, t=t: errs.append(t+': '+str(e)))
        await A.goto('http://localhost:3000/vr-test.html'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(800)
        code = await A.inner_text('#lobby-code')
        await B.goto(f'http://localhost:3000/?room={code}'); await B.wait_for_timeout(2500)
        await B.evaluate("document.querySelector('.role-seg button[data-val=cop]').click()"); await B.click('[data-action=join]'); await B.wait_for_timeout(800)
        await B.click('[data-action=desktop]'); await B.wait_for_timeout(400)
        await A.bring_to_front()
        await A.evaluate(H)
        await A.evaluate("__xr.position.set(0, 1.65, 0); __hands([-0.25, 0.75, -0.1], [0.25, 0.75, -0.1])")
        await A.click('[data-action=vr]'); await A.wait_for_timeout(2000)
        # rob one store (2 stars), then steal a police car (+2) right next to the waiting cop
        info = await A.evaluate("""(() => { const s = __cc.map.shops.find(s => s.name === 'GUN SHOP'); for (const [id, n] of __npcMap) if (n.type === 1 && Math.hypot(n.x - s.keeper[0], n.z - s.keeper[2]) < 0.5) return [id, s.keeper[0], s.keeper[2], s.yaw || 0]; })()""")
        await A.evaluate(f"({PLACE})({info[1]}, 0.75, {info[2] + 3.2})"); await A.wait_for_timeout(500)
        await A.evaluate("window.__rs = []; __cc.net.on('robStatus', m => __rs.push(JSON.stringify(m)))")
        await A.evaluate(f"window.__robT = setInterval(() => __cc.net.send({{ type: 'rob', id: {info[0]} }}), 250)")  # hold like a player
        for i in range(40):
            await A.wait_for_timeout(300)
            if await A.evaluate('__cc.G.me.wanted') >= 2: break
        await A.evaluate('clearInterval(window.__robT)')
        print('robStatus:', (await A.evaluate('__rs.slice(-3)')), 'head', await A.evaluate('__cc.camera.getWorldPosition(new __cc.camera.position.constructor()).toArray().map(v=>+v.toFixed(2))'), 'shop', info)
        pc = await A.evaluate('(() => { const c = [...__cc.cars.map.values()].find(c => c.police); const d = __cc.cars.doorWorld(c); return [c.id, d.x, d.z]; })()')
        await B.bring_to_front(); await B.evaluate(f'__cc.walker.feet.set({pc[1] + 1.2}, 0.3, {pc[2] + 0.4}); __cc.walker.vel.set(0,0,0)'); await B.wait_for_timeout(2200)
        await A.bring_to_front()
        await A.evaluate(f"({PLACE})({pc[1]}, 0.15, {pc[2]})"); await A.wait_for_timeout(2200)
        await A.evaluate(f"__cc.net.send({{ type: 'hijack', id: {pc[0]} }})"); await A.wait_for_timeout(600)
        await A.evaluate("__cc.net.send({ type: 'exitCar' })"); await A.wait_for_timeout(300)
        await A.evaluate(f"({PLACE})({pc[1]}, 0.15, {pc[2]})"); await A.wait_for_timeout(500)
        print('VR player wanted:', await A.evaluate('__cc.G.me.wanted'))
        aid = await A.evaluate('__cc.G.room.you')
        await A.bring_to_front(); await A.wait_for_timeout(300)
        print('A before arrest: alive', await A.evaluate('__cc.G.me.alive'), 'wanted', await A.evaluate('__cc.G.me.wanted'), 'hp', await A.evaluate('__cc.G.me.hp'))
        for attempt in range(4):
            await B.evaluate(f"__cc.net.send({{ type: 'arrest', id: {aid} }})"); await A.wait_for_timeout(1200)
            if await A.evaluate('__cc.cut.active'): break
            hpos = await A.evaluate('__cc.camera.getWorldPosition(new __cc.camera.position.constructor()).toArray()')
            await B.bring_to_front(); await B.evaluate(f'__cc.walker.feet.set({hpos[0] + 1.0}, {hpos[1] - 0.9}, {hpos[2] + 0.3}); __cc.walker.vel.set(0,0,0)'); await B.wait_for_timeout(700)
            await A.bring_to_front(); await A.wait_for_timeout(300)
            print('retry arrest; A wanted', await A.evaluate('__cc.G.me.wanted'), 'alive', await A.evaluate('__cc.G.me.alive'))
        print('VR cutscene active:', await A.evaluate('__cc.cut.active'), 'xr flag:', await A.evaluate('__cc.cut.xr'))
        await A.screenshot(path='/tmp/shots/v_c1_capture.png')
        while await A.evaluate('__cc.cut.active && __cc.cut.t < 12.5'): await A.wait_for_timeout(200)
        d = await A.evaluate("(() => { const c = __cc.cut; const s = c.carWorld(c.car.rearSeat); const h = __cc.camera.getWorldPosition(new __cc.camera.position.constructor()); return [+s.distanceTo(h).toFixed(2), +c.t.toFixed(1)]; })()")
        print('VR head distance from the back seat during the ride:', d[0], 'm at t =', d[1])
        await A.screenshot(path='/tmp/shots/v_c2_backseat.png')
        await A.evaluate("__xr.controllers.right.updateButtonValue('b-button', 1)"); await A.wait_for_timeout(250)
        await A.evaluate("__xr.controllers.right.updateButtonValue('b-button', 0)"); await A.wait_for_timeout(500)
        print('B skips to wake-up:', await A.evaluate('__cc.cut.t >= 36'), 'skipped flag:', await A.evaluate('__cc.cut.skipped'))
        await A.wait_for_timeout(1200); await A.screenshot(path='/tmp/shots/v_c3_wake.png')
        for i in range(60):
            if not await A.evaluate('__cc.cut.active'): break
            await A.wait_for_timeout(200)
        await A.wait_for_timeout(1000)
        h = await A.evaluate('__cc.camera.getWorldPosition(new __cc.camera.position.constructor()).toArray().map(v=>+v.toFixed(2))')
        print('VR prisoner:', await A.evaluate('__cc.prison.prisoner'), '| head in cell block:', h, '| prison view on:', await A.evaluate('__cc.prisonView.active'))
        await A.screenshot(path='/tmp/shots/v_p1_cell.png')
        # grip-hold an interaction (tie bedsheets needs work duty, so use the spoon bin)
        it = await A.evaluate("__cc.map.prison.interacts.find(i => i.id === 'spoon').p")
        await A.evaluate(f"({PLACE})({it[0]}, 0, {it[2] + 0.9})"); await A.wait_for_timeout(600)
        await A.evaluate(f"""(() => {{ __cc.rig.updateMatrixWorld(true); const v = new __cc.camera.position.constructor({it[0]}, {it[1]}, {it[2]}); __cc.rig.worldToLocal(v); __xr.controllers.right.position.set(v.x, v.y, v.z); }})()""")
        await A.wait_for_timeout(500)
        print('VR prompt at spoon bin:', await A.evaluate('__cc.G.prompt'))
        await A.evaluate("__xr.controllers.right.updateButtonValue('squeeze', 1)"); await A.wait_for_timeout(2600)
        await A.screenshot(path='/tmp/shots/v_p2_grip.png')
        await A.evaluate("__xr.controllers.right.updateButtonValue('squeeze', 0)"); await A.wait_for_timeout(700)
        print('VR items after grip-hold:', await A.evaluate('__cc.prison.me && __cc.prison.me.items'))
        # Gorilla arm movement still works in prison
        print('move mode:', await A.evaluate('__cc.vrMover.constructor.name'))
        print('ERRORS:', errs)
        await b.close()
asyncio.run(main())
