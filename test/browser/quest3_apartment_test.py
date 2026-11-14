# Apartments + THREADS on an emulated Quest 3: going home in VR (no "fell under the map" reset), grip on the exit door,
# and the THREADS menu page. Needs CC_TEST=1 + vr-test.html.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "localStorage.setItem('cc_tut', '1'); localStorage.setItem('cc_settings', JSON.stringify({ quality: 'low', shadows: false }));"
H = open(os.path.join(os.path.dirname(__file__), 'quest3_prison_test.py')).read().split('H = """')[1].split('"""')[0]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        P = await (await b.new_context(viewport={'width': 900, 'height': 520})).new_page(); await P.add_init_script(LOW)
        errs = []; P.on('pageerror', lambda e: errs.append(str(e)))
        await P.goto('http://localhost:3000/vr-test.html'); await P.wait_for_timeout(2500)
        await P.click('[data-goto=create]'); await P.click('[data-action=create]'); await P.wait_for_timeout(800)
        await P.evaluate(H); await P.evaluate("__xr.position.set(0, 1.65, 0); __hands([-0.25, 1.3, -0.4], [0.25, 1.3, -0.4])")
        await P.click('[data-action=vr]'); await P.wait_for_timeout(4000)
        await P.evaluate("__cc.net.send({ type: 'testXp', amt: 2500 })")
        T = await P.evaluate("__cc.map.threads")
        await P.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{T[0]} - 1.4, {T[1]}, {T[2]}], yaw: -Math.PI / 2, cash: 9000 }})"); await P.wait_for_timeout(2500)
        print('THREADS prompt:', await P.evaluate("__cc.G.prompt"))
        await P.evaluate("__xr.controllers.right.updateButtonValue('squeeze', 1)"); await P.wait_for_timeout(400); await P.evaluate("__xr.controllers.right.updateButtonValue('squeeze', 0)"); await P.wait_for_timeout(800)
        print('VR store page:', await P.evaluate("__cc.shopMenu.vrOpen && __cc.shopMenu.vrModel().title"))
        await P.screenshot(path='/tmp/shots/qa1_threads.png')
        await P.evaluate("__cc.shopMenu.close(); __cc.vrui.closeMenu()")
        D = await P.evaluate("__cc.map.aptDoor.keeper")
        await P.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{D[0]}, {D[1]}, {D[2]} - 1.2], yaw: Math.PI }})"); await P.wait_for_timeout(2000)
        await P.evaluate("__cc.net.send({ type: 'shopBuy', shop: 'APARTMENTS', item: 'buy' })"); await P.wait_for_timeout(700)
        await P.evaluate("__cc.net.send({ type: 'shopBuy', shop: 'APARTMENTS', item: 'home' })"); await P.wait_for_timeout(4000)
        print('home in VR:', await P.evaluate("JSON.stringify([__cc.rig.position.y.toFixed(1), __cc.aptView.here])"))
        await P.screenshot(path='/tmp/shots/qa2_home.png')
        u = await P.evaluate("__cc.map.apts[__cc.aptView.here]")
        await P.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{u['door'][0]}, {u['y']}, {u['door'][2]} - 0.9], yaw: Math.PI }})"); await P.wait_for_timeout(2000)
        print('exit prompt:', await P.evaluate("__cc.G.prompt"))
        await P.evaluate("__xr.controllers.right.updateButtonValue('squeeze', 1)"); await P.wait_for_timeout(400); await P.evaluate("__xr.controllers.right.updateButtonValue('squeeze', 0)"); await P.wait_for_timeout(2500)
        print('outside:', await P.evaluate("JSON.stringify([__cc.rig.position.y.toFixed(1), __cc.aptView.here])"))
        print('errors:', errs)
        await b.close()
asyncio.run(main())
