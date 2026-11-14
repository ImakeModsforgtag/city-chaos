# Gang turf in the browser (PC): picking a gang in the pause menu, the turf rings + flags, the HUD line while
# capturing, the TURF TAKEN banner, the flag changing color and the scoreboard turf count. Needs CC_TEST=1 on :3000.
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
        await A.evaluate("__cc.net.send({ type: 'testNoCops' })")
        # pause menu > gang
        await A.keyboard.press('Escape'); await A.wait_for_timeout(800)
        await A.click('.gang-seg button[data-val="1"] >> visible=true'); await A.wait_for_timeout(1000)
        print('gang:', await A.evaluate("__cc.G.players.get(__cc.G.room.you).gang"), '| toast:', await A.evaluate("document.getElementById('toast')?.textContent"))
        await A.screenshot(path='/tmp/shots/t1_pause.png')
        await A.click('[data-action=resume] >> visible=true'); await A.wait_for_timeout(500)
        # walk into CHAOS PARK
        await A.evaluate("__cc.net.send({ type: 'testTp', p: [-78, 0.4, -20], yaw: 0 })"); await A.wait_for_timeout(2500)
        print('line outside:', await A.inner_text('#jobline'))
        await A.screenshot(path='/tmp/shots/t2_zone.png')
        await A.evaluate("__cc.net.send({ type: 'testTp', p: [-78, 0.4, -26], yaw: 0 })")
        for i in range(30):
            await A.wait_for_timeout(1000)
            l = await A.inner_text('#jobline')
            if i % 6 == 0: print(' ', l)
            if 'yours' in l: break
        print('banner:', (await A.inner_text('#levelup')).replace('\n', ' | '))
        await A.screenshot(path='/tmp/shots/t3_taken.png')
        await A.evaluate("__cc.net.send({ type: 'testTp', p: [-62, 0.4, -40], yaw: Math.PI * 0.78 })"); await A.wait_for_timeout(2500)
        await A.screenshot(path='/tmp/shots/t4_flag.png')
        await A.keyboard.down('Tab'); await A.wait_for_timeout(800)
        print('board turf:', await A.evaluate("document.getElementById('scoreboard').innerText.split('\\n').slice(0, 3).join(' / ')"))
        await A.keyboard.up('Tab')
        print('errors:', errs)
        await b.close()
asyncio.run(main())
