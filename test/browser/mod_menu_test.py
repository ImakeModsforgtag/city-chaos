# Mod menu: PC (type MODMENU, panel, infinite ammo + auto, custom gun with scopes, fly) and
# emulated Quest 3 (A B A X Y opens the VR mod page, custom gun scope glass). Server: CC_TEST=1 not needed.
import asyncio, os, sys
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.removeItem('cc_mods'); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
H = open(os.path.join(os.path.dirname(__file__), 'quest3_prison_test.py')).read().split('H = """')[1].split('"""')[0]

async def pc(b):
    P = await b.new_page(viewport={'width': 1100, 'height': 680}); await P.add_init_script(LOW)
    errs = []; P.on('pageerror', lambda e: errs.append(str(e)))
    await P.goto('http://localhost:3000'); await P.wait_for_timeout(2500)
    await P.click('[data-goto=create]'); await P.click('[data-action=create]'); await P.wait_for_timeout(800)
    await P.click('[data-action=desktop]'); await P.wait_for_timeout(1200)
    await P.keyboard.type('modmenu', delay=60); await P.wait_for_timeout(800)
    print('PC: panel open after typing MODMENU:', await P.evaluate("!document.getElementById('modmenu').classList.contains('hidden')"), '| unlocked:', await P.evaluate('__cc.mods.unlocked'))
    await P.click('#modmenu [data-a=inf]'); await P.click('#modmenu [data-a=auto]'); await P.click('#modmenu [data-a=god]'); await P.wait_for_timeout(700)
    print('PC: server confirmed inf/auto/god:', await P.evaluate("[__cc.mods.s.inf, __cc.mods.s.auto, __cc.mods.s.god]"))
    # custom gun: sniper base, sniper scope, rainbow, 999 dmg
    await P.click('#modmenu [data-base=sniper]'); await P.select_option('#modmenu [data-scope]', 'sniper'); await P.select_option('#modmenu [data-skin]', 'rainbow')
    await P.evaluate("(() => { const r = document.querySelector('#modmenu [data-dmg]'); r.value = 999; r.dispatchEvent(new Event('change', { bubbles: true })); })()")
    await P.screenshot(path='/tmp/shots/m1_pc_panel.png')
    await P.click('#modmenu .mm-equip'); await P.wait_for_timeout(1200)
    print('PC: holding:', await P.evaluate('__cc.weapons.current.w'), '| damage:', await P.evaluate('__cc.weapons.def.damage'), '| auto:', await P.evaluate('__cc.weapons.def.auto'), '| scope:', await P.evaluate('!!__cc.weapons.model.userData.scope'))
    await P.keyboard.press('F8'); await P.wait_for_timeout(300)
    print('PC: F8 closes it:', await P.evaluate("document.getElementById('modmenu').classList.contains('hidden')"))
    await P.screenshot(path='/tmp/shots/m2_pc_custom_gun.png')
    # fire 15 shots: magazine must stay full
    mag0 = await P.evaluate('__cc.weapons.current.mag')
    for i in range(15): await P.evaluate('__cc.weapons.tryFire(true, true)'); await P.wait_for_timeout(130)
    await P.wait_for_timeout(500)
    print('PC: mag before/after 15 shots:', mag0, await P.evaluate('__cc.weapons.current.mag'))
    # scope
    await P.evaluate('__cc.desk.mouse.right = true'); await P.wait_for_timeout(600)
    print('PC: view after closing the panel:', await P.evaluate('__cc.G.view'))
    print('PC: scoped:', await P.evaluate('__cc.G.scoped'), 'fov', await P.evaluate('__cc.camera.fov'))
    await P.screenshot(path='/tmp/shots/m3_pc_sniper_scope.png')
    await P.evaluate('__cc.desk.mouse.right = false')
    await P.evaluate("__cc.mods.action('save')")
    await P.keyboard.press('F8'); await P.wait_for_timeout(300)
    await P.select_option('#modmenu [data-scope]', 'holo'); await P.click('#modmenu [data-base=ar]'); await P.click('#modmenu .mm-equip'); await P.keyboard.press('F8'); await P.wait_for_timeout(1000)
    await P.evaluate('__cc.desk.mouse.right = true'); await P.wait_for_timeout(600)
    print('PC: holo sight overlay:', await P.evaluate("!document.getElementById('sight').classList.contains('hidden') && document.getElementById('sight').classList.contains('holo')"))
    await P.screenshot(path='/tmp/shots/m4_pc_holo.png'); await P.evaluate('__cc.desk.mouse.right = false')
    # fly
    y0 = await P.evaluate('__cc.walker.feet.y')
    await P.evaluate("__cc.mods.action('fly')"); await P.keyboard.down('Space'); await P.wait_for_timeout(1500); await P.keyboard.up('Space')
    print('PC: fly up: feet y', round(y0, 2), '->', round(await P.evaluate('__cc.walker.feet.y'), 2))
    await P.evaluate("__cc.mods.action('esp')"); await P.wait_for_timeout(500)
    print('PC: ESP outlines drawn:', await P.evaluate('__cc.gold.markers.filter(m => m.g.visible).length'), '| ESP layer on:', await P.evaluate('__cc.camera.layers.isEnabled(5)'))
    await P.screenshot(path='/tmp/shots/m5_pc_fly_esp.png')
    print('PC errors:', errs)

async def vr(b):
    P = await b.new_page(viewport={'width': 1000, 'height': 560}); await P.add_init_script(LOW)
    errs = []; P.on('pageerror', lambda e: errs.append(str(e)))
    await P.goto('http://localhost:3000/vr-test.html'); await P.wait_for_timeout(2500)
    await P.click('[data-goto=create]'); await P.click('[data-action=create]'); await P.wait_for_timeout(800)
    await P.evaluate(H); await P.evaluate("__xr.position.set(0, 1.65, 0); __hands([-0.25, 1.3, -0.4], [0.25, 1.3, -0.4])")
    await P.click('[data-action=vr]'); await P.wait_for_timeout(1800)
    for side, btn in [('right', 'a-button'), ('right', 'b-button'), ('right', 'a-button'), ('left', 'x-button'), ('left', 'y-button')]:
        await P.evaluate(f"__xr.controllers.{side}.updateButtonValue('{btn}', 1)"); await P.wait_for_timeout(250)
        await P.evaluate(f"__xr.controllers.{side}.updateButtonValue('{btn}', 0)"); await P.wait_for_timeout(250)
    await P.wait_for_timeout(500)
    print('VR: A B A X Y -> menu open:', await P.evaluate('__cc.vrui.menuOpen'), '| page:', await P.evaluate('__cc.mods.vrPage'), '| unlocked:', await P.evaluate('__cc.mods.unlocked'))
    await P.screenshot(path='/tmp/shots/m6_vr_modmenu.png')
    for a in ['mod:inf', 'mod:auto', 'mod:boom']: await P.evaluate(f"__cc.menuAction('{a}')"); await P.wait_for_timeout(300)
    await P.wait_for_timeout(600)
    print('VR: inf/auto/boom on:', await P.evaluate('[__cc.mods.s.inf, __cc.mods.s.auto, __cc.mods.s.boom]'))
    await P.evaluate("__cc.menuAction('mod:page:custom')"); await P.wait_for_timeout(300)
    for a in ['mod:scope', 'mod:skin', 'mod:dmg+', 'mod:dmg+', 'mod:equip']: await P.evaluate(f"__cc.menuAction('{a}')"); await P.wait_for_timeout(150)
    await P.wait_for_timeout(1000)
    await P.screenshot(path='/tmp/shots/m7_vr_custom_page.png')
    print('VR: custom gun', await P.evaluate('JSON.stringify(__cc.mods.s.custom)'), '| holding:', await P.evaluate('__cc.weapons.current.w'))
    await P.evaluate("__cc.menuAction('mod:close')"); await P.wait_for_timeout(400)
    # raise the scope to the eye: lens shows the zoomed view
    EYE = """(() => { const cc = __cc, V = cc.camera.position.constructor; const m = cc.weapons.model; if (!m || !m.userData.scope) return null;
      cc.rig.updateMatrixWorld(true); const head = cc.camera.getWorldPosition(new V()), eye = m.userData.scope.eye.getWorldPosition(new V());
      const d = head.clone().sub(eye).applyAxisAngle(new V(0, 1, 0), -cc.rig.rotation.y); const c = __xr.controllers.right.position; c.set(c.x + d.x, c.y + d.y, c.z + d.z); return +head.distanceTo(eye).toFixed(3); })()"""
    await P.evaluate("__hands([-0.2, 1.3, -0.4], [0.05, 1.45, -0.25])")
    for _ in range(4): await P.evaluate(EYE); await P.wait_for_timeout(350)
    await P.wait_for_timeout(500)
    print('VR: custom scope glass shows zoom:', await P.evaluate('(() => { const m = __cc.weapons.model; return !!(__cc.gold.rt && m.userData.scope && m.userData.scope.lens.material.map === __cc.gold.rt.texture); })()'))
    await P.screenshot(path='/tmp/shots/m8_vr_scope.png')
    print('VR errors:', errs)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        await pc(b)
        b2 = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        await vr(b2)
        await b.close(); await b2.close()
asyncio.run(main())
