# Emotes in the browser: hold G on PC, pick one with the mouse, the other player sees the bubble + animation.
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
        await A.evaluate("__cc.net.send({ type: 'testTp', p: [0, 0.15, 0], yaw: 0 })"); await B.evaluate("__cc.net.send({ type: 'testTp', p: [0, 0.15, -4], yaw: Math.PI })"); await A.wait_for_timeout(2500)
        await A.mouse.click(500, 300); await A.wait_for_timeout(300)
        await A.evaluate("__cc.net.send({ type: 'testTp', p: [0, 0.15, 0], yaw: 0 })"); await B.evaluate("__cc.net.send({ type: 'testTp', p: [0, 0.15, -4], yaw: Math.PI })"); await A.wait_for_timeout(2000)
        await A.keyboard.down('KeyG'); await A.wait_for_timeout(500)
        await A.evaluate("__cc.desk.mouse.dx += 0; __cc.G.ew && (__cc.G.ew.x = 0, __cc.G.ew.y = 0)")
        # choose "dance" (index 2 = right side of the wheel) by nudging the virtual mouse
        await A.evaluate("__cc.G.ew.x = 120; __cc.G.ew.y = 0")
        await A.wait_for_timeout(600)
        print('wheel open:', await A.evaluate("!document.getElementById('emotewheel').classList.contains('hidden')"), '| selected:', await A.evaluate("__cc.G.ew && __cc.G.ew.i"))
        await A.screenshot(path='/tmp/shots/e1_wheel.png')
        await A.evaluate("window.__sent = []; const s0 = __cc.net.send.bind(__cc.net); __cc.net.send = (m) => { if (m && m.type === 'emote') window.__sent.push(m); return s0(m); }")
        await B.evaluate("window.__em = []; __cc.net.on('emote', (m) => window.__em.push(m))")
        await A.keyboard.up('KeyG'); await B.wait_for_timeout(500); await B.screenshot(path='/tmp/shots/e2_seen.png')
        print('A sent:', await A.evaluate("JSON.stringify(window.__sent)"), '| B got:', await B.evaluate("JSON.stringify(window.__em)"), '| G.ew after:', await A.evaluate("JSON.stringify(__cc.G.ew)"))
        aid = await A.evaluate("__cc.G.room.you")
        print('B sees emote:', await B.evaluate(f"JSON.stringify(__cc.remote.players.get({aid})?.avatar.emote)"))
        print('errors:', errs)
        await b.close()
asyncio.run(main())
