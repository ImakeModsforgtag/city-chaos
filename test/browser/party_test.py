# Parties in the browser: make a party, a friend joins with the code on the PARTY screen, the leader creates a room
# and the friend is pulled into it, the party list. Needs a server on :3000.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.setItem('cc_tut', '1'); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        errs = []
        A = await (await b.new_context(viewport={'width': 1000, 'height': 620})).new_page(); await A.add_init_script(LOW); A.on('pageerror', lambda e: errs.append('A ' + str(e)))
        B = await (await b.new_context(viewport={'width': 1000, 'height': 620})).new_page(); await B.add_init_script(LOW); B.on('pageerror', lambda e: errs.append('B ' + str(e)))
        for P in (A, B): await P.goto('http://localhost:3000'); await P.wait_for_timeout(2500)
        await A.click('[data-goto=party]'); await A.wait_for_timeout(400); await A.click('[data-action=partyCreate]'); await A.wait_for_timeout(1000)
        code = await A.inner_text('#party-code-show'); print('party code:', code)
        await A.screenshot(path='/tmp/shots/p1_party.png')
        await B.click('[data-goto=party]'); await B.wait_for_timeout(400); await B.fill('#party-code', code); await B.click('[data-action=partyJoin]'); await B.wait_for_timeout(1200)
        print('B party list:', (await B.inner_text('#party-list')).replace('\n', ' | '))
        print('A badge:', await A.inner_text('#party-badge'))
        # leader creates a room
        await A.click('[data-goto=back]'); await A.wait_for_timeout(300)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(2500)
        ra = await A.evaluate("__cc.G.room && __cc.G.room.code"); rb = await B.evaluate("__cc.G.room && __cc.G.room.code")
        print('A room', ra, '| B followed into', rb, '| B toast:', await B.evaluate("document.getElementById('toast')?.textContent"))
        await B.screenshot(path='/tmp/shots/p2_followed.png')
        # B opens the party screen from pause in the lobby... just read the list
        print('A party list:', (await A.inner_text('#party-list')).replace('\n', ' | '))
        print('errors:', errs)
        await b.close()
asyncio.run(main())
