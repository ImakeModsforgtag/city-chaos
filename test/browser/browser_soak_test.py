# Browser soak: 2 desktop players + 1 emulated Quest 3 in one room, ~3 minutes of random input
# (keys, clicks, shop/job menus, teleports around the city). Prints every page error. Needs CC_TEST=1 (+ vr-test.html for VR).
import asyncio, os, random, sys
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.setItem('cc_tut', '1'); } catch (e) {}"
H = open(os.path.join(os.path.dirname(__file__), 'quest3_prison_test.py')).read().split('H = """')[1].split('"""')[0]
SECS = int(sys.argv[1]) if len(sys.argv) > 1 else 180
KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyR', 'KeyE', 'Digit1', 'Digit2', 'Digit3', 'KeyQ', 'Tab', 'ShiftLeft', 'KeyF', 'KeyL']

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        errs = []
        pages = []
        for i in range(2):
            P = await (await b.new_context(viewport={'width': 800, 'height': 480})).new_page(); await P.add_init_script(LOW)
            P.on('pageerror', lambda e, i=i: errs.append(f'PC{i} {e}')); pages.append(P)
        A, B = pages
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        code = await A.evaluate("new URLSearchParams(location.search).get('room')")
        await B.goto('http://localhost:3000/?room=' + code); await B.wait_for_timeout(2500); await B.wait_for_selector('[data-action=join]', state='visible', timeout=60000); await B.click('[data-action=join]'); await B.wait_for_timeout(1500)
        for P in pages: await P.click('[data-action=desktop]'); await P.wait_for_timeout(800)
        V = None
        if os.path.exists('public/vr-test.html'):
            V = await (await b.new_context(viewport={'width': 800, 'height': 480})).new_page(); await V.add_init_script(LOW)
            V.on('pageerror', lambda e: errs.append(f'VR {e}'))
            await V.goto('http://localhost:3000/vr-test.html?room=' + code); await V.wait_for_timeout(2500); await V.wait_for_selector('[data-action=join]', state='visible', timeout=60000); await V.click('[data-action=join]'); await V.wait_for_timeout(800)
            await V.evaluate(H); await V.evaluate("__xr.position.set(0, 1.65, 0); __hands([-0.25, 1.3, -0.4], [0.25, 1.3, -0.4])")
            await V.wait_for_timeout(3000); print('VR btn visible', await V.is_visible('[data-action=vr]'), await V.evaluate('__cc.G.vrSupported'), await V.evaluate('__cc.G.view'))
            await V.click('[data-action=vr]', timeout=60000); await V.wait_for_timeout(1500)
        print('room', code, 'players', await A.evaluate('__cc.G.players.size'))
        rnd = random.Random(7)
        end = asyncio.get_event_loop().time() + SECS; n = 0
        while asyncio.get_event_loop().time() < end:
            n += 1
            for P in pages:
                r = rnd.random()
                try:
                    if r < 0.45: k = rnd.choice(KEYS); await P.keyboard.down(k); await P.wait_for_timeout(rnd.randint(50, 600)); await P.keyboard.up(k)
                    elif r < 0.65: await P.mouse.click(rnd.randint(50, 750), rnd.randint(50, 430), button=rnd.choice(['left', 'left', 'right']))
                    elif r < 0.75: await P.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{rnd.uniform(-150, 150):.1f}, 30, {rnd.uniform(-150, 150):.1f}], yaw: {rnd.uniform(0, 6):.2f} }})")
                    elif r < 0.8: await P.evaluate("(() => { const j = __cc.map.jobBoard; __cc.net.send({ type: 'testTp', p: [j[0] + 1.6, j[1], j[2]], yaw: Math.PI / 2 }); })()")
                    elif r < 0.85: await P.keyboard.press('Escape'); await P.wait_for_timeout(300); await P.keyboard.press('Escape')
                    elif r < 0.9: await P.evaluate("__cc.net.send({ type: 'shoot', w: 'pistol', o: [0, 2, 0], d: [Math.random() - .5, 0, Math.random() - .5] })")
                    else: await P.wait_for_timeout(500)
                except Exception as e: errs.append('driver ' + str(e)[:120])
            if V and n % 2 == 0:
                try:
                    c = rnd.choice(['left', 'right']); btn = rnd.choice(['trigger', 'squeeze', 'a-button', 'b-button', 'x-button', 'y-button'] if c == 'right' else ['trigger', 'squeeze', 'x-button', 'y-button'])
                    if btn in ('a-button', 'b-button') and c == 'left': btn = 'x-button'
                    await V.evaluate(f"__xr.controllers.{c}.updateButtonValue('{btn}', 1)"); await V.wait_for_timeout(rnd.randint(80, 500))
                    await V.evaluate(f"__xr.controllers.{c}.updateButtonValue('{btn}', 0)")
                    await V.evaluate(f"__hands([{rnd.uniform(-.5, 0):.2f}, {rnd.uniform(.4, 1.5):.2f}, {rnd.uniform(-.6, .1):.2f}], [{rnd.uniform(0, .5):.2f}, {rnd.uniform(.4, 1.5):.2f}, {rnd.uniform(-.6, .1):.2f}])")
                except Exception as e: errs.append('vrdriver ' + str(e)[:120])
        for P in pages + ([V] if V else []):
            print('alive page, in room:', await P.evaluate('!!__cc.G.room'), '| fps-ish frames ok')
        print('rounds', n, '| page errors', len(errs))
        for e in errs[:20]: print('  ', e[:300])
        await b.close()
asyncio.run(main())
