# 🌙 Noční loop — autonomní vylepšování (David spí, ráno hraje)

**Pravidla (NEROZBÍJET — nemám vizuální kontrolu, jen David ráno):**
- Jedna malá, bezpečná, samostatná změna za iteraci.
- Preferuj MapLibre styling v `try/catch` (nemůže shodit appku) před zásahy do herní smyčky.
- Po každé změně: `node` syntax check `index.html` → bump verze (badge v index.html + `CACHE` v sw.js) → `git commit` + `git push origin master`.
- Zapiš sem do logu co hotovo. Pak `ScheduleWakeup` ~3600 s znovu.
- Skonči (nereschedule) po ~7 vylepšeních NEBO po ~7:00 ráno. Šetři tokeny — minimum explorace.

## Fronta (vyber další NEHOTOVÉ)
1. [HOTOVO v93] Urbánní zem místo louky + okna na fasádách (3 typy).
2. [ ] Atmosféra: jemnější realistická obloha + fog/horizont (setSky tuning), teplejší tón.
3. [ ] POI cedule obchodů — nastylovat popisky obchodů (poi layer) ať jsou vidět názvy krámů.
4. [ ] Silnice polish: přechody (zebra) u křižovatek nebo obrubníky/jemnější čáry (styling).
5. [ ] NPC polish: přirozenější toulání (občas zastaví, mění rychlost), víc hlášek.
6. [ ] Šimmy/projektily šmrnc: stín pod hráčem hezčí, stopa za hranolkou, mírný „pop" při hodu.
7. [ ] Kolize s baráky (OPATRNĚ — mění pohyb): queryRenderedFeatures u hráče, do baráku nepustí. Throttle.
8. [ ] HUD/skóre polish + semínko reputačního systému.

## CÍL (David ráno): kouzelné město GTA VII Český Těšín — vibe, hloubka, detaily. Klidně 3D prvky, ale BEZPEČNĚ.

## Log
- v93 (start noci): urbánní zem, okna na fasádách (WINDOWS flag), pestré baráky, širší ulice, názvy ulic bez čísel, perspektiva NPC, atribuce do menu.
- [HOTOVO v94] Střešní čepice (`sim-roof`, plný plát navrch → okna jen na stěnách, ne na střeše) + širší chodníky/cesty/pěšiny (RW +30%, path widthExpr).

## Fronta 2 (vibe/hloubka — bezpečné MapLibre styling)
- [HOTOVO v95] Atmosféra „zlatá hodina": teplý zlatavý horizont (setSky) → hloubka.
- [HOTOVO v97] Stíny budov: ambient occlusion (intensity 0.45) u paty/hran = hloubka.
- [HOTOVO v96] POI cedule obchodů (poi label styling, tmavý text + krémový halo) — vibe.
- [ ] Pouliční detaily: víc světel/dlažby textura na chodník (line-pattern už je) — případně lampy jako symboly.
- [HOTOVO v98] Mlha do dálky: vzdálené postavy lehce zamlžené (alpha dle dM) = hloubka.
- [HOTOVO v99] NPC přirozenější toulání: civil občas postojí, animace jen při pohybu.

## Loop ukončen ~5:30 (limit) po 6 vylepšeních (v94–v99). Ráno převzal David.
