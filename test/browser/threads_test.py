# 👕 THREADS in the browser: the mannequins, the store menu, buying an outfit, a second player seeing it,
# and the CUSTOMIZE outfit row. Needs a CC_TEST=1 server on :3000.
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
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        code = await A.evaluate("new URLSearchParams(location.search).get('room')")
        await B.goto('http://localhost:3000/?room=' + code); await B.wait_for_selector('[data-action=join]', state='visible', timeout=60000); await B.click('[data-action=join]'); await B.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await B.click('[data-action=desktop]'); await A.wait_for_timeout(6000)
        T = await A.evaluate("__cc.map.threads")
        # mannequins
        await A.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{T[0]} - 7, {T[1]}, {T[2]} - 3], yaw: -Math.PI / 2 - 0.5, cash: 2000 }})"); await A.wait_for_timeout(2500)
        await A.screenshot(path='/tmp/shots/w1_mannequins.png')
        for i in range(3):
            await A.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{T[0]} - 1.5, {T[1]}, {T[2]}], yaw: -Math.PI / 2 }})"); await A.wait_for_timeout(2000)
            if await A.evaluate("__cc.G.prompt"): break
        print('prompt:', await A.evaluate("__cc.G.prompt"))
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(800)
        print('menu:', await A.evaluate("__cc.shopMenu.shop"))
        await A.screenshot(path='/tmp/shots/w2_menu.png')
        await A.click('[data-buy="buy:4"]'); await A.wait_for_timeout(1500)
        print('result:', await A.inner_text('#shopmenu .sm-msg.good') if await A.query_selector('#shopmenu .sm-msg.good') else '?', '| cos:', await A.evaluate("__cc.G.players.get(__cc.G.room.you).cos.outfit"))
        await A.keyboard.press('Escape'); await A.wait_for_timeout(500)
        # B looks at A
        await B.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{T[0]} - 4.5, {T[1]}, {T[2]}], yaw: Math.PI / 2 }})"); await B.wait_for_timeout(3000)
        print('B sees outfit:', await B.evaluate("(() => { for (const p of __cc.G.players.values()) if (p.id !== __cc.G.room.you) return p.cos.outfit; })()"))
        await B.screenshot(path='/tmp/shots/w3_seen.png')
        # customize row
        await A.keyboard.press('Escape'); await A.wait_for_timeout(500); await A.click('[data-action=pause-custom] >> visible=true'); await A.wait_for_timeout(1200)
        print('customize outfit row:', await A.inner_text('.cycler[data-key=outfit] b'))
        await A.screenshot(path='/tmp/shots/w4_custom.png')
        print('errors:', errs)
        await b.close()
asyncio.run(main())
