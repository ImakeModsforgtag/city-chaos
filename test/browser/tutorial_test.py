# First-time tutorial + bug report in the browser. Needs a CC_TEST=1 server on :3000.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)

async def step(A):
    return await A.evaluate("document.querySelector('#tutorial b')?.textContent + ' :: ' + document.querySelector('#tutorial span')?.textContent")

async def wait_step(A, n, secs=20):
    for i in range(secs * 2):
        s = await step(A)
        if f'TUTORIAL {n}/' in s or (n == 0 and await A.evaluate("document.getElementById('tutorial').classList.contains('hidden')")): return s
        await A.wait_for_timeout(500)
    return 'TIMEOUT ' + await step(A)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        A = await (await b.new_context(viewport={'width': 1000, 'height': 620})).new_page(); await A.add_init_script(LOW)
        errs = []; A.on('pageerror', lambda e: errs.append(str(e)))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(2500)
        print('1', await wait_step(A, 1)); await A.screenshot(path='/tmp/shots/t1.png')
        await A.evaluate("(() => { const f = __cc.walker.feet; __cc.net.send({ type: 'testTp', p: [f.x + 10, f.y, f.z], yaw: 0 }); })()")
        print('2', await wait_step(A, 2))
        await A.keyboard.press('Space'); await A.wait_for_timeout(200); await A.keyboard.press('Space')
        print('3', await wait_step(A, 3, 30))
        await A.evaluate("__cc.net.send({ type: 'shoot', w: 'pistol', o: [0,0,0], d: [0,0,-1] })")
        print('4', await wait_step(A, 4))
        await A.keyboard.down('Tab'); await A.wait_for_timeout(1200); await A.keyboard.up('Tab')
        print('5', await wait_step(A, 5)); await A.screenshot(path='/tmp/shots/t5_beam.png')
        print('   marker visible:', await A.evaluate("__cc.marker.group ? __cc.marker.group.visible : JSON.stringify(Object.keys(__cc.marker))"))
        await A.evaluate("(() => { const j = __cc.map.jobBoard; __cc.net.send({ type: 'testTp', p: [j[0] + 1.6, j[1], j[2]], yaw: Math.PI / 2 }); })()")
        print('6', await wait_step(A, 6))
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(500)
        print('7', await wait_step(A, 7)); await A.screenshot(path='/tmp/shots/t7.png')
        await A.keyboard.press('Escape'); await A.wait_for_timeout(300)
        print('done', await wait_step(A, 0, 25))
        await A.wait_for_timeout(1500)
        print('banner:', (await A.inner_text('#levelup')).replace('\n', ' | '), '| cash', await A.evaluate("__cc.G.players.get(__cc.G.room.you).cash"), '| cc_tut', await A.evaluate("localStorage.getItem('cc_tut')"))
        await A.screenshot(path='/tmp/shots/t8_done.png')
        # bug report from the pause menu
        await A.evaluate("__cc.G.view") 
        await A.keyboard.press('Escape'); await A.wait_for_timeout(800)
        vis = await A.evaluate("[...document.querySelectorAll('[data-action=bug]')].some(b => b.offsetParent)")
        print('bug button visible in pause:', vis)
        if vis:
            await A.click('[data-action=bug] >> visible=true'); await A.fill('#bugtext', 'Test bug: the tutorial beam was hard to see'); await A.click('[data-action=bugsend]'); await A.wait_for_timeout(1500)
            print('bug msg:', await A.inner_text('#bugmsg'))
        # automatic error report
        await A.evaluate("setTimeout(() => { throw new Error('tutorial test fake error') }, 0)"); await A.wait_for_timeout(4000)
        # skip with K on a second fresh player
        B = await (await b.new_context(viewport={'width': 900, 'height': 560})).new_page(); await B.add_init_script(LOW)
        B.on('pageerror', lambda e: errs.append('B ' + str(e)))
        await B.goto('http://localhost:3000'); await B.wait_for_timeout(2500)
        await B.click('[data-goto=create]'); await B.click('[data-action=create]'); await B.wait_for_timeout(1500)
        await B.click('[data-action=desktop]'); await B.wait_for_timeout(2500)
        print('B', await wait_step(B, 1)); await B.keyboard.press('KeyK'); await B.wait_for_timeout(800)
        print('B after K hidden:', await B.evaluate("document.getElementById('tutorial').classList.contains('hidden')"), '| cash', await B.evaluate("__cc.G.players.get(__cc.G.room.you).cash"))
        # reload: no tutorial again
        await B.goto('http://localhost:3000'); await B.wait_for_timeout(2500)
        await B.click('[data-goto=create]'); await B.click('[data-action=create]'); await B.wait_for_timeout(1500)
        await B.click('[data-action=desktop]'); await B.wait_for_timeout(3000)
        print('B second visit tutorial hidden:', await B.evaluate("document.getElementById('tutorial').classList.contains('hidden')"))
        print('errors:', [e for e in errs if 'fake error' not in e])
        await b.close()
asyncio.run(main())
