# Street race in the browser (PC): buy + call a car, drive into the 🏁 start line, countdown, checkpoints with the beam,
# the race line, finishing banner + prize. Needs a CC_TEST=1 server on :3000.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.setItem('cc_tut', '1'); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
# move the car you're driving toward x,z in small steps (the server refuses teleporting cars)
STEP = """async ([x, z]) => { for (let i = 0; i < 400; i++) { const c = __cc.driving.car; if (!c) return 'nocar'; const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
  if (d < 2) return 'ok'; const s = Math.min(3, d); c.x += dx / d * s; c.z += dz / d * s; c.yaw = Math.atan2(-dx, -dz); c.speed = 20; await new Promise(r => setTimeout(r, 120)); } return 'slow'; }"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        A = await (await b.new_context(viewport={'width': 1000, 'height': 620})).new_page(); await A.add_init_script(LOW)
        errs = []; A.on('pageerror', lambda e: errs.append(str(e)))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(2500)
        await A.evaluate("(() => { const L = __cc.map.carLot; __cc.net.send({ type: 'testTp', p: [L[0] + 1.6, L[1], L[2]], yaw: Math.PI / 2, cash: 2000 }); })()"); await A.wait_for_timeout(1500)
        await A.evaluate("__cc.net.send({ type: 'shopBuy', shop: 'CAR LOT', item: 'buy:compact' })"); await A.wait_for_timeout(800)
        await A.evaluate("__cc.net.send({ type: 'testTp', p: [62.5, 0.15, -40], yaw: 0 })"); await A.wait_for_timeout(1200)
        await A.evaluate("__cc.net.on('carCallResult', (m) => { window.__ccr = m; }); __cc.net.send({ type: 'carCall' })"); await A.wait_for_timeout(1500)
        cid = await A.evaluate("window.__ccr && window.__ccr.id"); print('called car', cid, await A.evaluate("JSON.stringify(window.__ccr)"))
        await A.evaluate(f"(() => {{ const c = __cc.cars.get({cid}); __cc.net.send({{ type: 'testTp', p: [c.x + Math.cos(c.yaw) * 1.8, c.y, c.z - Math.sin(c.yaw) * 1.8], yaw: 0 }}); }})()"); await A.wait_for_timeout(1500)
        await A.evaluate("window.__log = []; const e = __cc.net.emit.bind(__cc.net); __cc.net.emit = (t, m) => { if (/car|exit|enter|pMsg/i.test(t)) window.__log.push(t + ' ' + JSON.stringify(m).slice(0, 120)); return e(t, m); }; const s0 = __cc.net.send.bind(__cc.net); __cc.net.send = (m) => { if (m && m.type !== 'state' && m.type !== 'carState') window.__log.push('SEND ' + JSON.stringify(m).slice(0, 100)); return s0(m); }")
        await A.evaluate(f"__cc.net.send({{ type: 'hijack', id: {cid} }})"); await A.wait_for_timeout(1500)
        print('log:', await A.evaluate("JSON.stringify(window.__log)"))
        print('driving:', await A.evaluate("__cc.driving.active"), '| toast:', await A.evaluate("document.getElementById('toast')?.textContent"), '| car:', await A.evaluate(f"JSON.stringify(__cc.cars.get({cid}) && [__cc.cars.get({cid}).x, __cc.cars.get({cid}).z, __cc.cars.get({cid}).owner])"), '| me:', await A.evaluate("JSON.stringify([__cc.walker.feet.x, __cc.walker.feet.y, __cc.walker.feet.z, __cc.G.room.you])"))
        print('to start:', await A.evaluate(STEP, [56, -30])); await A.wait_for_timeout(1500)
        print('race line:', await A.inner_text('#jobline')); await A.screenshot(path='/tmp/shots/r1_lobby.png')
        for i in range(40):
            if await A.evaluate("__cc.raceView ? __cc.raceView.state : ''") == 'running': break
            await A.wait_for_timeout(500)
        cps = await A.evaluate("__cc.raceView.route().cps")
        print('route', await A.evaluate("__cc.raceView.route().name"), len(cps), 'checkpoints | line:', await A.inner_text('#jobline'))
        for i, (x, z) in enumerate(cps):
            print(' cp', i, await A.evaluate(STEP, [x, z]), '|', await A.inner_text('#jobline'))
            if i == 1: print('   marker', await A.evaluate('JSON.stringify([__cc.marker.root.visible, __cc.marker.root.position])')); await A.screenshot(path='/tmp/shots/r2_checkpoint.png')
        await A.wait_for_timeout(1500)
        print('banner:', (await A.inner_text('#levelup')).replace('\n', ' | '))
        await A.screenshot(path='/tmp/shots/r3_finish.png')
        print('errors:', errs)
        await b.close()
asyncio.run(main())
