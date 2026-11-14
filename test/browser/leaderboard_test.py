# Leaderboards in the browser: play a bit (so there's a save), open 🏆 LEADERBOARDS from the pause menu and the main
# menu, switch boards, see yourself highlighted. Needs a server on :3000.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.setItem('cc_tut', '1'); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        A = await (await b.new_context(viewport={'width': 1000, 'height': 700})).new_page(); await A.add_init_script(LOW)
        errs = []; A.on('pageerror', lambda e: errs.append(str(e)))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(9000)   # wait for a save
        await A.keyboard.press('Escape'); await A.wait_for_timeout(800)
        await A.click('[data-action=pause-leaders] >> visible=true'); await A.wait_for_timeout(2000)
        print('title:', await A.inner_text('#lb-title'), '| rows:', (await A.inner_text('#lb-list')).replace('\n', ' / ')[:200])
        print('me:', await A.inner_text('#lb-me'), '| highlighted:', await A.evaluate("!!document.querySelector('#lb-list li.me')"))
        await A.screenshot(path='/tmp/shots/lb1.png')
        await A.click('[data-lb=xp]'); await A.wait_for_timeout(500)
        print('xp board:', await A.inner_text('#lb-title'), '|', (await A.inner_text('#lb-list')).replace('\n', ' / ')[:120])
        print('errors:', errs)
        await b.close()
asyncio.run(main())
