# The BOSS CREW in the browser (PC): the alert banner, the boss health bar, the beam, the crowned boss + armored guards,
# shooting the boss down. Needs a CC_TEST=1 server on :3000.
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.setItem('cc_tut', '1'); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        A = await (await b.new_context(viewport={'width': 1000, 'height': 620})).new_page(); await A.add_init_script(LOW)
        errs = []; A.on('pageerror', lambda e: errs.append(str(e)))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(2500)
        await A.evaluate("__cc.net.send({ type: 'testNoCops' }); __cc.net.send({ type: 'testBoss', shop: 'GUN SHOP' })"); await A.wait_for_timeout(2500)
        print('banner:', (await A.inner_text('#levelup')).replace('\n', ' | '))
        print('bossbar:', await A.inner_text('#bossbar'), '| marker:', await A.evaluate("__cc.marker.root.visible"))
        await A.screenshot(path='/tmp/shots/b1_alert.png')
        # look at the crew walking in
        pos = await A.evaluate("(() => { const b = __cc.G.boss; const n = __cc.npcs.map.get(b.id); return [n.x, n.y, n.z]; })()")
        await A.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{pos[0]} + 7, {pos[1]}, {pos[2]} + 7], yaw: Math.atan2(7, 7) }})"); await A.wait_for_timeout(2500)
        await A.screenshot(path='/tmp/shots/b2_crew.png')
        # hurt the boss through the server's real damage path: shoot him a bunch
        for i in range(30):
            if not await A.evaluate("!!__cc.G.boss"): break
            await A.evaluate("""(() => { const b = __cc.G.boss; const n = __cc.npcs.map.get(b.id); if (!n) return;
              const me = __cc.camera.getWorldPosition(new __cc.camera.position.constructor()); const t = [n.x, n.y + 1.3, n.z];
              const d = [t[0] - me.x, t[1] - me.y, t[2] - me.z]; const L = Math.hypot(...d);
              __cc.net.send({ type: 'shoot', w: 'pistol', o: [me.x, me.y, me.z], d: d.map(v => v / L) }); })()""")
            await A.wait_for_timeout(500)
        print('after shooting:', await A.inner_text('#bossbar') if await A.is_visible('#bossbar') else 'bar gone', '| cash', await A.evaluate("__cc.G.players.get(__cc.G.room.you).cash"))
        await A.screenshot(path='/tmp/shots/b3_after.png')
        print('errors:', errs)
        await b.close()
asyncio.run(main())
