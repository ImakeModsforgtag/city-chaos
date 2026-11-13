# CITY BANK + jobs on an emulated Quest 3: grip at the JOBS kiosk opens the VR job page, take a delivery job
# (marker + notices), grip at the teller opens the bank page, hold grip at the vault to drill. Needs CC_TEST=1 + vr-test.html.
import asyncio, os, math
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); } catch (e) {}"
H = open(os.path.join(os.path.dirname(__file__), 'quest3_prison_test.py')).read().split('H = """')[1].split('"""')[0]

async def tp(P, x, z):
    await P.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{x}, 0.15, {z}], yaw: 0, cash: 800 }})")
    for i in range(40):
        await P.wait_for_timeout(250)
        f = await P.evaluate("[__cc.rig.position.x, __cc.rig.position.z]")
        if math.hypot(f[0] - x, f[1] - z) < 1.2: break
    await P.wait_for_timeout(1500)

async def grip(P, hold=0.4):
    await P.evaluate("__xr.controllers.right.updateButtonValue('squeeze', 1)"); await P.wait_for_timeout(int(hold * 1000))
    await P.evaluate("__xr.controllers.right.updateButtonValue('squeeze', 0)"); await P.wait_for_timeout(700)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        P = await (await b.new_context(viewport={'width': 900, 'height': 520})).new_page(); await P.add_init_script(LOW)
        errs = []; P.on('pageerror', lambda e: errs.append(str(e)))
        await P.goto('http://localhost:3000/vr-test.html'); await P.wait_for_timeout(2500)
        await P.click('[data-goto=create]'); await P.click('[data-action=create]'); await P.wait_for_timeout(800)
        await P.evaluate(H); await P.evaluate("__xr.position.set(0, 1.65, 0); __hands([-0.25, 1.3, -0.4], [0.25, 1.3, -0.4])")
        await P.click('[data-action=vr]'); await P.wait_for_timeout(2000)
        jb = await P.evaluate('__cc.map.jobBoard')
        await tp(P, jb[0], jb[2] + 0.6)
        print('VR kiosk prompt:', await P.evaluate('__cc.G.prompt'))
        await grip(P)
        print('VR jobs page:', await P.evaluate("__cc.vrui.model && __cc.vrui.model.title + ' | ' + __cc.vrui.model.items.map(i => i.label).join(' / ')"))
        await P.evaluate("__cc.menuAction('shop:buy:delivery')"); await P.wait_for_timeout(1500)
        print('VR job:', await P.evaluate('__cc.G.job && __cc.G.job.text'), '| marker', await P.evaluate('__cc.marker.root.visible'), '| menu closed', not await P.evaluate('__cc.vrui.menuOpen'))
        await P.screenshot(path='/tmp/shots/q1_vr_job.png')
        tel = await P.evaluate("__cc.map.shops.find(s => s.name === 'CITY BANK').keeper")
        await tp(P, tel[0], tel[2] + 3)
        print('VR teller prompt:', await P.evaluate('__cc.G.prompt'))
        await grip(P)
        print('VR bank page:', await P.evaluate("__cc.vrui.model && __cc.vrui.model.title + ' | ' + __cc.vrui.model.sub"))
        await P.evaluate("__cc.menuAction('shop:buy:dep100')"); await P.wait_for_timeout(1000)
        print('VR deposit -> savings', await P.evaluate('__cc.G.bank'))
        await P.evaluate("__cc.menuAction('shop:close')"); await P.wait_for_timeout(500)
        await P.evaluate("__cc.net.send({ type: 'testNoCops' })")
        B = await P.evaluate('__cc.map.bank')
        await tp(P, B['drill'][0], B['drill'][2] - 0.2)
        print('VR vault prompt:', await P.evaluate('__cc.G.prompt'))
        await grip(P, hold=6)
        print('VR drilling progress:', await P.evaluate('__cc.G.rob && __cc.G.rob.p'), '| state', await P.evaluate('__cc.bankView.state'))
        await P.screenshot(path='/tmp/shots/q2_vr_vault.png')
        print('errors:', errs)
        await b.close()
asyncio.run(main())
