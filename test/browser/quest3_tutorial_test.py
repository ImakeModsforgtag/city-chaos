# Tutorial on an emulated Quest 3: VR notices, moving on, SKIP TUTORIAL in the Y menu. Needs CC_TEST=1 + vr-test.html.
import asyncio, os, math
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); } catch (e) {}"
H = open(os.path.join(os.path.dirname(__file__), 'quest3_prison_test.py')).read().split('H = """')[1].split('"""')[0]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        P = await (await b.new_context(viewport={'width': 900, 'height': 520})).new_page(); await P.add_init_script(LOW)
        errs = []; P.on('pageerror', lambda e: errs.append(str(e)))
        await P.goto('http://localhost:3000/vr-test.html'); await P.wait_for_timeout(2500)
        await P.click('[data-goto=create]'); await P.click('[data-action=create]'); await P.wait_for_timeout(800)
        await P.evaluate(H); await P.evaluate("__xr.position.set(0, 1.65, 0); __hands([-0.25, 1.3, -0.4], [0.25, 1.3, -0.4])")
        await P.click('[data-action=vr]'); await P.wait_for_timeout(3000)
        print('VR step:', await P.evaluate("__cc.vrui.notice ? JSON.stringify(__cc.vrui.notice).slice(0,200) : 'tut i=' + document.querySelector('#tutorial b')?.textContent"))
        print('text:', await P.evaluate("document.querySelector('#tutorial span')?.textContent"))
        await P.screenshot(path='/tmp/shots/vt1.png')
        # Y menu shows SKIP TUTORIAL
        await P.evaluate("(() => { const f = __cc.rig.position; __cc.net.send({ type: 'testTp', p: [f.x + 10, 0.15, f.z], yaw: 0 }); })()"); await P.wait_for_timeout(3000)
        print('after move:', await P.evaluate("document.querySelector('#tutorial b')?.textContent"))
        await P.evaluate("__xr.controllers.left.updateButtonValue('y-button', 1)"); await P.wait_for_timeout(400)
        await P.evaluate("__xr.controllers.left.updateButtonValue('y-button', 0)"); await P.wait_for_timeout(1000)
        print('menu open:', await P.evaluate('__cc.vrui.menuOpen'), '| has skip:', await P.evaluate("JSON.stringify((__cc.vrui.buttons||[]).map(b => b.act)).includes('tutskip')"))
        await P.screenshot(path='/tmp/shots/vt2_menu.png')
        await P.evaluate("__cc.menuAction('tutskip')"); await P.wait_for_timeout(1000)
        print('skipped:', await P.evaluate("document.getElementById('tutorial').classList.contains('hidden')"), '| menu closed:', not await P.evaluate('__cc.vrui.menuOpen'))
        print('errors:', errs)
        await b.close()
asyncio.run(main())
