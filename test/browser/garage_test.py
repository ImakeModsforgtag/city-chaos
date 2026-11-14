# Your own cars in the browser (PC): the CAR LOT show cars, buying, calling your car with C, the beam,
# getting in and driving it. Needs a CC_TEST=1 server on :3000.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.setItem('cc_tut', '1'); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        A = await (await b.new_context(viewport={'width': 1000, 'height': 620})).new_page(); await A.add_init_script(LOW)
        errs = []; A.on('pageerror', lambda e: errs.append(str(e)))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(2500)
        # look at the show cars
        await A.evaluate("(() => { const L = __cc.map.carLot; __cc.net.send({ type: 'testTp', p: [L[0] + 12, L[1], L[2] - 3], yaw: Math.PI * 0.85, cash: 3000 }); })()")
        await A.wait_for_timeout(2500); await A.screenshot(path='/tmp/shots/g1_showroom.png')
        await A.evaluate("(() => { const L = __cc.map.carLot; __cc.net.send({ type: 'testTp', p: [L[0] + 1.6, L[1], L[2]], yaw: Math.PI / 2 }); })()")
        await A.wait_for_timeout(2000)
        print('prompt:', await A.evaluate("__cc.G.prompt"))
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(800)
        print('menu open:', await A.evaluate("__cc.shopMenu.shop"))
        await A.screenshot(path='/tmp/shots/g2_menu.png')
        await A.click('[data-buy="buy:compact"]'); await A.wait_for_timeout(1500)
        print('after buy:', await A.inner_text('#shopmenu .sm-msg.good') if await A.query_selector('#shopmenu .sm-msg.good') else await A.inner_text('#shopmenu'))
        print('garage:', await A.evaluate("JSON.stringify(__cc.G.garage)"))
        await A.screenshot(path='/tmp/shots/g3_bought.png')
        await A.keyboard.press('Escape'); await A.wait_for_timeout(500)
        # walk out to the street and press C
        await A.evaluate("(() => { const s = __cc.map.trafficLoops[0][0]; __cc.net.send({ type: 'testTp', p: [s[0] + 6, 0.15, s[1] + 6], yaw: 0 }); })()"); await A.wait_for_timeout(1500)
        await A.mouse.click(500, 300); await A.wait_for_timeout(400)
        await A.evaluate("__cc.net.on('carCallResult', (m) => { window.__ccr = m; })")
        await A.keyboard.press('KeyC'); await A.wait_for_timeout(2500)
        print('call result:', await A.evaluate("JSON.stringify(window.__ccr)"), '| toast:', await A.evaluate("document.getElementById('toast')?.textContent"))
        print('beacon:', await A.evaluate("JSON.stringify(__cc.G.carBeacon)"), '| marker visible:', await A.evaluate("__cc.marker.root.visible"))
        cid = await A.evaluate("__cc.G.carBeacon && __cc.G.carBeacon.id")
        await A.screenshot(path='/tmp/shots/g4_called.png')
        # walk to the car and get in
        await A.evaluate(f"(() => {{ const c = __cc.cars.get({cid}); __cc.net.send({{ type: 'testTp', p: [c.x + Math.cos(c.yaw) * -1.9, c.y, c.z + Math.sin(c.yaw) * 1.9], yaw: c.yaw }}); }})()"); await A.wait_for_timeout(1500)
        print('car prompt:', await A.evaluate("__cc.G.prompt"))
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(1500)
        print('driving:', await A.evaluate("__cc.driving.active"), '| top speed:', await A.evaluate("__cc.driving.car && __cc.driving.car.stats.top"))
        await A.keyboard.down('KeyW'); await A.wait_for_timeout(4000); await A.keyboard.up('KeyW')
        print('speed after 4s:', await A.evaluate("__cc.driving.car && __cc.driving.car.speed.toFixed(1)"))
        await A.screenshot(path='/tmp/shots/g5_driving.png')
        print('errors:', errs)
        await b.close()
asyncio.run(main())
