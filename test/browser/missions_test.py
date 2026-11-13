# Daily missions in the browser: the tracker pops up on join, progress bars, MISSION COMPLETE banner, the
# all-3 bonus, Tab shows the tracker, MY PROGRESS lists the missions, and the VR menu page. Needs CC_TEST=1.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
H = open(os.path.join(os.path.dirname(__file__), 'quest3_prison_test.py')).read().split('H = """')[1].split('"""')[0]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        A = await (await b.new_context(viewport={'width': 1000, 'height': 620})).new_page(); await A.add_init_script(LOW)
        errs = []; A.on('pageerror', lambda e: errs.append(str(e)))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(1500)
        print('tracker on join:', (await A.inner_text('#missions')).replace('\n', ' | ')[:300])
        await A.screenshot(path='/tmp/shots/m1_tracker.png')
        ms = await A.evaluate('__cc.G.missions.list')
        # half of mission 1
        evs = await A.evaluate("(async () => (await import('/shared/missions.js')).missionsFor((await import('/shared/missions.js')).dayKey()).map(m => [m.ev, m.goal]))()")
        if evs[0][1] > 1:
            await A.evaluate(f"__cc.net.send({{ type: 'testMission', ev: '{evs[0][0]}', n: 1 }})"); await A.wait_for_timeout(1000)
            print('progress:', await A.evaluate('__cc.G.missions.list[0].prog'), '/', evs[0][1])
        await A.evaluate(f"__cc.net.send({{ type: 'testMission', ev: '{evs[0][0]}', n: {evs[0][1]} }})"); await A.wait_for_timeout(800)
        print('banner:', (await A.inner_text('#levelup')).replace('\n', ' | '))
        await A.screenshot(path='/tmp/shots/m2_complete.png')
        for ev, goal in evs[1:]:
            await A.evaluate(f"__cc.net.send({{ type: 'testMission', ev: '{ev}', n: {goal} }})"); await A.wait_for_timeout(400)
        for i in range(30):
            await A.wait_for_timeout(500)
            if 'ALL DAILY' in await A.inner_text('#levelup'): break
        print('all-3 banner:', (await A.inner_text('#levelup')).replace('\n', ' | '), '| done flags', await A.evaluate('__cc.G.missions.list.map(q => q.done).join(",")'), '| bonus', await A.evaluate('__cc.G.missions.bonus'))
        await A.screenshot(path='/tmp/shots/m3_all.png')
        await A.wait_for_timeout(8000)
        print('tracker hidden after a while:', await A.evaluate("document.getElementById('missions').classList.contains('hidden')"))
        await A.keyboard.down('Tab'); await A.wait_for_timeout(600)
        print('Tab shows it again:', not await A.evaluate("document.getElementById('missions').classList.contains('hidden')"))
        await A.keyboard.up('Tab')
        await A.wait_for_timeout(6000)
        await A.evaluate("__cc.net.send({ type: 'leave' })"); await A.wait_for_timeout(800)
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=profile]'); await A.wait_for_timeout(400)
        print('MY PROGRESS missions:', (await A.inner_text('#pf-missions')).replace('\n', ' | ')[:300])
        await A.screenshot(path='/tmp/shots/m4_progress.png')
        print('errors:', errs)
        # VR menu page
        if os.path.exists('public/vr-test.html'):
            V = await (await b.new_context(viewport={'width': 900, 'height': 520})).new_page(); await V.add_init_script(LOW)
            V.on('pageerror', lambda e: errs.append('VR ' + str(e)))
            await V.goto('http://localhost:3000/vr-test.html'); await V.wait_for_timeout(2500)
            await V.click('[data-goto=create]'); await V.click('[data-action=create]'); await V.wait_for_timeout(800)
            await V.evaluate(H); await V.evaluate("__xr.position.set(0, 1.65, 0); __hands([-0.25, 1.3, -0.4], [0.25, 1.3, -0.4])")
            await V.click('[data-action=vr]'); await V.wait_for_timeout(2500)
            await V.evaluate("__xr.controllers.left.updateButtonValue('y-button', 1)"); await V.wait_for_timeout(400)
            await V.evaluate("__xr.controllers.left.updateButtonValue('y-button', 0)"); await V.wait_for_timeout(800)
            print('VR menu has missions item:', await V.evaluate("__cc.vrui.menuOpen && (__cc.vrui.model.items ? '' : JSON.stringify(__cc.vrui.buttons.map(b => b.act)).includes('missions'))"))
            await V.evaluate("__cc.menuAction('missions')"); await V.wait_for_timeout(800)
            print('VR missions page:', await V.evaluate("__cc.vrui.model.title + ' | ' + __cc.vrui.model.sub + ' | ' + __cc.vrui.model.items.map(i => i.label).join(' / ')"))
            await V.screenshot(path='/tmp/shots/m5_vr.png')
            print('VR errors:', errs)
        await b.close()
asyncio.run(main())
