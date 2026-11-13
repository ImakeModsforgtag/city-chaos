# Levels + XP in the browser: level badge + XP bar on the HUD, "+XP" pops, the LEVEL UP banner, other players'
# name tags and the scoreboard showing levels, locked items in CUSTOMIZE, level on MY PROGRESS. Needs CC_TEST=1.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        A = await (await b.new_context(viewport={'width': 1000, 'height': 620})).new_page(); await A.add_init_script(LOW)
        B = await (await b.new_context(viewport={'width': 700, 'height': 450})).new_page(); await B.add_init_script(LOW)
        errs = []; A.on('pageerror', lambda e: errs.append(str(e))); B.on('pageerror', lambda e: errs.append('B ' + str(e)))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        # customize: the Crown is locked for a new player
        await A.click('[data-goto=custom]'); await A.wait_for_timeout(600)
        for i in range(4): await A.click('.cycler[data-key=hat] button:last-child'); await A.wait_for_timeout(150)
        print('CUSTOMIZE hat label:', await A.inner_text('.cycler[data-key=hat] b'))
        await A.screenshot(path='/tmp/shots/l1_locked.png')
        await A.click('#screen-custom [data-goto=back]'); await A.wait_for_timeout(300)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        code = await A.evaluate('__cc.G.room.code')
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(1500)
        print('HUD level badge:', await A.inner_text('#lvlnum'), '| xp bar', await A.evaluate("document.getElementById('xpfill').style.width"))
        print('wearing the locked Crown in game? my avatar hat =', await A.evaluate('__cc.G.players.get(__cc.G.room.you).cos.hat'))
        # B joins
        await B.goto(f'http://localhost:3000/?room={code}'); await B.wait_for_timeout(2500)
        await B.click('[data-action=join]'); await B.wait_for_timeout(2500)
        # XP pops + level up
        await A.evaluate("__cc.net.send({ type: 'testXp', amt: 40 })"); await A.wait_for_timeout(500)
        print('XP pop:', await A.inner_text('#xppop'), '| myXp', await A.evaluate('__cc.G.myXp'), '| conn', await A.evaluate('__cc.net.connected'), '| bar', await A.evaluate("document.getElementById('xpfill').style.width"))
        await A.screenshot(path='/tmp/shots/l2_xppop.png')
        await A.evaluate("__cc.net.send({ type: 'testXp', amt: 500 })"); await A.wait_for_timeout(900)
        print('LEVEL UP banner:', (await A.inner_text('#levelup')).replace('\n', ' | '), '| badge', await A.inner_text('#lvlnum'))
        await A.screenshot(path='/tmp/shots/l3_levelup.png')
        await A.wait_for_timeout(1500)
        print('B sees A at level:', await B.evaluate("(() => { const me = __cc.G.room.you; for (const p of __cc.G.players.values()) if (p.id !== me) return p.lvl; })()"),
              '| B feed:', await B.evaluate("[...document.querySelectorAll('#feed div')].map(d => d.textContent).slice(-2).join(' | ')"))
        await A.keyboard.down('Tab'); await A.wait_for_timeout(600)
        print('scoreboard:', (await A.inner_text('#scoreboard')).replace('\n', ' ')[:160])
        await A.screenshot(path='/tmp/shots/l4_board.png')
        await A.keyboard.up('Tab')
        await A.evaluate("__cc.net.send({ type: 'leave' })"); await A.wait_for_timeout(800)
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        print('menu line:', await A.inner_text('#wallet-line'))
        await A.click('[data-goto=profile]'); await A.wait_for_timeout(400)
        print('MY PROGRESS:', await A.inner_text('#pf-lvl'), '|', await A.inner_text('#pf-xp'), '|', await A.inner_text('#pf-next'))
        await A.screenshot(path='/tmp/shots/l5_progress.png')
        print('errors:', errs)
        await b.close()
asyncio.run(main())
