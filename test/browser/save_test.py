# Saved progress in the browser: new player gets $200, cash earned is saved, reload the page and join
# again -> cash back, MY PROGRESS screen shows the stats, START OVER erases it. Needs CC_TEST=1 (cash hook).
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
CASH = '__cc.G.players.get(__cc.G.room.you).cash'

async def play(P):
    await P.click('[data-goto=create]'); await P.click('[data-action=create]'); await P.wait_for_timeout(1500)
    await P.click('[data-action=desktop]'); await P.wait_for_timeout(1500)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width': 1000, 'height': 640})
        await ctx.add_init_script(LOW)
        P = await ctx.new_page(); errs = []; P.on('pageerror', lambda e: errs.append(str(e)))
        await P.goto('http://localhost:3000'); await P.wait_for_timeout(2500)
        print('menu wallet line (new player):', await P.inner_text('#wallet-line'))
        await play(P)
        print('first game cash:', await P.evaluate(CASH), '| toast:', await P.evaluate("document.getElementById('toast') ? document.getElementById('toast').textContent : ''"))
        await P.evaluate("(() => { const f = __cc.walker.feet; __cc.net.send({ type: 'testTp', p: [f.x, f.y, f.z], yaw: 0, cash: 1234 }); })()"); await P.wait_for_timeout(7000)
        print('after earning: cash', await P.evaluate(CASH), '| saved token cash:', await P.evaluate("JSON.parse(atob(localStorage.getItem('cc_save').split('.')[0].replace(/-/g,'+').replace(/_/g,'/'))).cash"))
        # leave + reload = close the game and come back later
        await P.evaluate("__cc.net.send({ type: 'leave' })"); await P.wait_for_timeout(800)
        await P.goto('http://localhost:3000'); await P.wait_for_timeout(2500)
        await P.screenshot(path='/tmp/shots/p0_after_reload.png')
        print('menu wallet line after reload:', await P.inner_text('#wallet-line'))
        await P.click('[data-goto=profile]'); await P.wait_for_timeout(500)
        print('MY PROGRESS:', await P.inner_text('#pf-cash'), '|', (await P.inner_text('#pf-stats')).replace('\n', ' ')[:200])
        await P.screenshot(path='/tmp/shots/p1_progress.png')
        await P.click('[data-goto=main]'); await P.wait_for_timeout(300)
        await play(P)
        print('second game cash (loaded):', await P.evaluate(CASH))
        await P.screenshot(path='/tmp/shots/p2_loaded.png')
        await P.evaluate("__cc.net.send({ type: 'leave' })"); await P.wait_for_timeout(800); await P.goto('http://localhost:3000'); await P.wait_for_timeout(2500)
        await P.click('[data-goto=profile]'); await P.wait_for_timeout(400)
        await P.click('[data-action=resetProgress]'); await P.wait_for_timeout(300)
        print('reset asks to confirm:', await P.inner_text('#pf-msg'))
        await P.click('[data-action=resetProgress]'); await P.wait_for_timeout(300)
        print('after START OVER:', await P.inner_text('#pf-msg'), '|', await P.inner_text('#pf-cash'), '| token', await P.evaluate("localStorage.getItem('cc_save')"))
        print('errors:', errs)
        await b.close()
asyncio.run(main())
