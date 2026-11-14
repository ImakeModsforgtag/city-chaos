# Weekly challenges in the browser: Tab shows the daily missions + the weekly challenges, a weekly challenge finishing
# shows the banner, MY PROGRESS lists them. Needs CC_TEST=1 on :3000.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.setItem('cc_tut', '1'); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        A = await (await b.new_context(viewport={'width': 1000, 'height': 680})).new_page(); await A.add_init_script(LOW)
        errs = []; A.on('pageerror', lambda e: errs.append(str(e)))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(5000)
        print('weekly list:', await A.evaluate("JSON.stringify(__cc.G.weekly && __cc.G.weekly.list.map(q => q.text))"))
        ev = await A.evaluate("__cc.G.weekly.list[3].id")
        await A.keyboard.down('Tab'); await A.wait_for_timeout(1000)
        print('tab shows weekly:', 'WEEKLY CHALLENGES' in await A.evaluate("document.getElementById('missions')?.innerText || document.body.innerText"))
        await A.screenshot(path='/tmp/shots/wk1_tab.png'); await A.keyboard.up('Tab')
        # finish the last weekly challenge through a test event
        evname = await A.evaluate("({ wkills: 'kills', wcrooks: 'crooks', wjobs: 'jobs', wraces: 'race', wracewin: 'raceWin', wturf: 'turf', wheist: 'heist', wboss: 'boss', wearn: 'earn', wminutes: 'minutes', wcars: 'cars', wdaily: 'mission', wheadshots: 'headshots' })[__cc.G.weekly.list[3].id]")
        await A.evaluate(f"__cc.net.send({{ type: 'testMission', ev: '{evname}', n: 99999 }})"); await A.wait_for_timeout(1200)
        print('banner:', (await A.inner_text('#levelup')).replace('\n', ' | '))
        await A.screenshot(path='/tmp/shots/wk2_banner.png')
        print('errors:', errs)
        await b.close()
asyncio.run(main())
