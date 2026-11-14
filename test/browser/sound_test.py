# Sound in the browser: the car radio starts in your own car, N changes station (and off), it stops when you get out;
# gunshots with the new echo and far-away muffling, ambience in the park / downtown / winter don't throw errors.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.setItem('cc_tut', '1'); } catch (e) {}"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        A = await (await b.new_context(viewport={'width': 1000, 'height': 620})).new_page(); await A.add_init_script(LOW)
        errs = []; A.on('pageerror', lambda e: errs.append(str(e)))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(5000)
        print('audio ctx:', await A.evaluate("(async () => { const a = await import('/js/audio/audio.js'); return a.audioCtx() && a.audioCtx().state; })()"))
        await A.evaluate("(() => { const L = __cc.map.carLot; __cc.net.send({ type: 'testTp', p: [L[0] + 1.6, L[1], L[2]], yaw: Math.PI / 2, cash: 3000 }); })()"); await A.wait_for_timeout(1500)
        await A.evaluate("__cc.net.send({ type: 'shopBuy', shop: 'CAR LOT', item: 'buy:compact' })"); await A.wait_for_timeout(800)
        await A.evaluate("__cc.net.send({ type: 'testTp', p: [62.5, 0.15, -40], yaw: 0 })"); await A.wait_for_timeout(1500)
        await A.evaluate("__cc.net.on('carCallResult', (m) => { window.__ccr = m; }); __cc.net.send({ type: 'carCall' })"); await A.wait_for_timeout(1500)
        cid = await A.evaluate("window.__ccr && window.__ccr.id")
        await A.evaluate(f"(() => {{ const c = __cc.cars.get({cid}); __cc.net.send({{ type: 'testTp', p: [c.x + Math.cos(c.yaw) * 1.8, c.y, c.z - Math.sin(c.yaw) * 1.8], yaw: 0 }}); }})()"); await A.wait_for_timeout(1500)
        await A.evaluate(f"__cc.net.send({{ type: 'hijack', id: {cid} }})"); await A.wait_for_timeout(1500)
        st = "(async () => (await import('/js/audio/audio.js')).carRadioStation())()"
        print('driving:', await A.evaluate("__cc.driving.active"), '| radio:', await A.evaluate(st))
        await A.mouse.click(500, 300); await A.wait_for_timeout(300)
        for i in range(3):
            await A.keyboard.press('KeyN'); await A.wait_for_timeout(700); print('  N ->', await A.evaluate(st), '|', await A.evaluate("document.getElementById('notice')?.textContent || ''"))
        await A.keyboard.press('KeyN'); await A.wait_for_timeout(700)
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(1500)
        print('out of the car:', not await A.evaluate("__cc.driving.active"), '| radio:', await A.evaluate(st))
        # shots near and far, ambience spots
        await A.evaluate("(async () => { const a = await import('/js/audio/audio.js'); const V = __cc.camera.position.constructor; a.playShot('ar', null); a.playShot('sniper', new V(80, 2, 80)); a.playShot('shotgun', new V(5, 2, 5)); a.playExplosion(new V(30, 2, 30)); a.AMB.winter = true; a.stopAmbience(); a.startAmbience(); })()")
        await A.evaluate("__cc.net.send({ type: 'testTp', p: [-84, 0.4, -28], yaw: 0 })"); await A.wait_for_timeout(8000)
        print('park ambience ok | errors:', errs)
        await b.close()
asyncio.run(main())
