# GTA 7: Těšín City — Plán pokračování

> Živý dokument. Stavíme po fázích, každá fáze musí být **hratelná** sama o sobě
> (žádný polorozbitý moloch). Po každé fázi: test → balanc → další.

---

## Princip delegace (kdo má co psát)

| Model | Role | Co dělá |
|---|---|---|
| **Opus** (architekt) | návrh & balanc | Návrh provázaných systémů (tolerance, ekonomika, D20, save), čísla a vyvážení, revize velkých změn, rozhodnutí mapové pipeline. „Jak to do sebe zapadá / kolik čeho." Rutinní kód NEpíše. |
| **Sonnet** (inženýr) | implementace | ~80 % práce. Kóduje featury, jakmile jsou navržené: ovládání, piko systém, inventář, shopy, NPC AI, UI, wiring hlášek, kašna, avatar. |
| **Haiku** (dělník) | drobná data | Pole hlášek, definice itemů, texty D&D událostí, konfigy. |

**Pravidlo:** než se kóduje nová PROVÁZANÁ mechanika (C/D/E), nech Opus navrhnout
strukturu + čísla. Pak to Sonnet jen postaví. Jednorázové texty/data → Haiku.

---

## Fáze A — Mapa (základ světa)  · PROBÍHÁ
**Cíl:** celý Český Těšín jako hezký hratelný svět.
- Předloha z OSM (hotovo, Polsko vyříznuté) → **Nano Banana** přemaluje na hezkou mapu.
- Já slícuju art s daty: **kolize** (domy = zdi, ulice = pochozí) + **navigace** (název ulice nahoře — názvy jsou v OSM datech).
- **Opus:** rozhodnutí jak slícovat art ↔ kolize (obrázek-svět vs tiles). **Sonnet:** render image-world, kolize z OSM, street-name HUD.

## Fáze B — Ovládání + boj + rychlé opravy  · Sonnet
- **Twin-stick:** levý joystick pohyb, pravý míření + střelba.
- **Hranolky = samopal** (rychlé, slabé). **Smažák = granát** (cooldown + mastná stopa = zpomalení nepřátel).
- **Avatar drží hranolky** 🍟.
- **Kašna fix:** čistá kruhová kolize (chodíš kolem), Eržika se v ní koupe.
- **NPC fix:** chodí věrohodně / v combat módu jdou po hráči; **šipka** na off-screen enemy.
- **Hlášky** (death/popup/wave/boss) z tvého seznamu — wave přepsané na agresivní, Peco = jeden z mnoha volně spawnovaných bossů.
- **Opus:** revize twin-stick ergonomie na mobilu. **Sonnet:** vše ostatní.

## Fáze C — Piko / tolerance / stav  · Opus návrh → Sonnet impl
Motor tempa hry.
- Inventář, piko v gramech, **stackování**.
- Sníst dávku → **buff** (150 % pohyb/útok, 2 min / 0,1 g).
- **Tolerance:** každé užití zvyšuje skrytý atribut; další buff chce větší dávku, jinak rovnou dojezd.
- **Dojezd:** 70 % rychlost + −1 HP / 10 s.
- **Záchrana:** jídlo (večerka), safehouse (full heal + reset tolerance), sklep (rychlý spánek, 30 % okradení).
- **Opus:** state machine + čísla + balanc. **Sonnet:** implementace + inventář UI.

## Fáze D — Loot & ekonomika  · Opus návrh → Sonnet impl
- **Popelnice:** timer prohledávání → loot (vratné lahve, měděné kabely, nedojedené jídlo [HP/šance otravy], piko).
- **Večerka (legální):** výkup lahví, prodej léčiv (pečivo proti dojezdu, Braník na HP).
- **Zastavárna / pochybné NPC (černý trh):** výkup mědi a přebytku pika za vyšší cenu.
- **Opus:** loot tabulky + ceny + ekonomický balanc. **Sonnet:** shopy, popelnice, inventář.

## Fáze E — D&D textové události (D20)  · Opus návrh → Sonnet impl → Haiku data
- Při přesile / policii / překážce se hra **pozastaví** → hráč volí → **hod D20** modifikovaný atributy.
- **Atributy:** Výmluvnost (vykecat se / lepší ceny), Zlodějna (krádeže, spánek v cizím), Úprk (útěk bez ztrát), Haluz (skryté štěstí — zvrací kritický neúspěch, lepší loot).
- **Opus:** architektura event/atribut/dice + formát obsahu. **Sonnet:** engine + UI. **Haiku:** psaní textů událostí.

## Fáze F — Progrese & svět  · Sonnet + Opus balanc
- Bossové se spawnují **volně po městě** (Peco jeden z mnoha).
- Level systém, peníze, skóre, **save** (localStorage).
- **Opus:** co persistovat, level křivka, balanc. **Sonnet:** implementace.

---

## Průřezové (řešit ve správný čas)
- **Save/persistence** — navrhnout DŘÍV než zbují ekonomika (jinak refaktor). Opus návrh, Sonnet impl.
- **Výkon** — na velké mapě s hodně NPC/loot: AI/update jen **poblíž hráče** (spatial culling), ne jen render. Sonnet.
- **Balanc pass** po každé fázi. Opus.

## Rizika / co může nastat
- Nano Banana nemusí být konzistentní přes velkou mapu → možná po čtvrtích / iterace stylu.
- Velká mapa + hodně entit → nutný culling AI.
- Bez save systému se ekonomika/progrese špatně testuje → save brzy.
- Scope creep → každá fáze musí zůstat hratelná a uzavřená.

## Hotovo (základ stojí)
Engine (bounded svět, render jen viditelného), postava + menu (AI art), zvuky (Web Audio),
hudba, nastavení, nick + globální leaderboard (Firebase), vlny/boss/smažák/párno (přepracují se v C/F).
