import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { FACTION_ALLIED, FACTION_SOVIET, FACTION_EMPIRE } from '../../utils/emojis';

export const data = new SlashCommandBuilder()
  .setName('tips')
  .setDescription('Get a random helpful tip or piece of trivia about Red Alert 3');

export const guildOnly = false;

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  const tips = getTips();
  const tip = tips[Math.floor(Math.random() * tips.length)];
  const quote = getRandomQuoteForTip(tip);
  const tipWithEmoji = addEmojiToTip(tip);
  const embedColor = getColorForFaction(tip.faction);

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle('💡 RA3 Tip')
    .setDescription(tipWithEmoji)
    .setFooter({ text: quote });

  await interaction.reply({ embeds: [embed] });
}

function addEmojiToTip(tip: { text: string; faction: string }): string {
  switch (tip.faction) {
    case 'allies':
      return `${FACTION_ALLIED} ${tip.text}`;
    case 'soviets':
      return `${FACTION_SOVIET} ${tip.text}`;
    case 'empire':
      return `${FACTION_EMPIRE} ${tip.text}`;
    default:
      return tip.text;
  }
}

function getColorForFaction(faction: string): number {
  switch (faction) {
    case 'allies':
      return 0x3b82f6;
    case 'soviets':
      return 0xef4444;
    case 'empire':
      return 0xf59e0b;
    default:
      return 0xe67e22;
  }
}

function getRandomQuoteForTip(tip: { text: string; faction: string }): string {
  const quotes = getQuotesByFaction(tip.faction);
  return quotes[Math.floor(Math.random() * quotes.length)];
}

function getQuotesByFaction(faction: string): string[] {
  const quotes: Record<string, string[]> = {
    allies: [
      '"Shake it baby!" - Tanya',
      '"Keeping the peace!" - Peacekeeper',
      '"Just kick the tires and light the fires!" - Apollo Fighter',
      '"Time to chill!" - Cryocopter',
      '"Nothing to see here!" - Mirage Tank',
      '"Death from above!" - Aircraft Carrier',
      '"I got their attention!" - Tanya',
    ],
    soviets: [
      '"Kirov reporting!" - Kirov Airship',
      '"For Mother Russia!" - Conscript',
      '"The seas will run RED!" - Dreadnought',
      '"Apocalypse has begun!" - Apocalypse Tank',
      '"Electrician in the field!" - Tesla Trooper',
      '"One less infant." - Natasha',
      '"We will bury them!" - Apocalypse Tank',
    ],
    empire: [
      '"For the Emperor!" - Imperial Warrior',
      '"Transform and roll out!" - Tengu',
      '"Bow before us!" - Shogun Battleship',
      '"Their end is near." - Rocket Angel',
      '"Destruction is honorable!" - King Oni',
      '"I am not a weapon!" - Yuriko Omega',
    ],
    general: [
      '"Knowledge is power." - Community wisdom',
      '"Practice makes perfect." - Veteran advice',
      '"Watch your replays to improve." - Pro tip',
      '"Use /help to discover all commands." - E.V.A.',
    ],
    trivia: [
      '"Did you know?" - Fun fact',
      '"History is written by the victors." - RA3 loading screen',
      '"The more you know!" - Community trivia',
    ],
  };
  return quotes[faction] || quotes.general;
}

function getTips(): { text: string; faction: string }[] {
  return [
    // General Gameplay
    {
      text: '**Economy:** Focus on capturing additional ore nodes and building multiple refineries rather than adding a second harvester to a single refinery. Having 3+ refineries before your opponent is a huge economic advantage.',
      faction: 'general',
    },
    {
      text: '**Scouting:** Use the best scouting units for each faction: the Soviet War Bear (effective against spies and engineers), the Imperial Burst Drone (flies and is great for spying on Soviet construction), and the Imperial Mecha Tengu/Jet Tengu in the mid-to-late game.',
      faction: 'general',
    },
    {
      text: '**Strategic Scouting:** Park a unit (e.g., a dog or bear) near key strategic points like expansion ore nodes or oil derricks to monitor enemy expansion and prevent them from taking them.',
      faction: 'general',
    },
    {
      text: '**Garrisoned Buildings:** Remember that placing infantry in buildings is not always effective. The range of anti-vehicle units inside garrisons is very short, making them vulnerable to long-range attacks. Soviet Conscripts are masters at clearing garrisons with Molotov cocktails from a safe distance.',
      faction: 'soviets',
    },
    {
      text: '**Micro-Management:** Use the `X` key to scatter endangered units. Quickly reselect the survivors and repeat the maneuver to minimize losses.',
      faction: 'general',
    },
    {
      text: '**Map Control:** Ore nodes are scattered across the map, and ore collectors are not as durable as in previous games. Securing map control is critical to maintaining a healthy economy and denying resources to your opponent.',
      faction: 'general',
    },
    {
      text: '**Crane Usage (Soviets):** The Soviet Crusher Crane allows for simultaneous construction of multiple buildings, significantly speeding up base development compared to Allies and Empire. A common build order involves starting with a Crane for faster expansion.',
      faction: 'soviets',
    },
    {
      text: '**Turtling Punished:** RA3 actively punishes turtling. Staying in your base allows your opponent to claim more ore nodes, build a larger army, and eventually overwhelm you with superior resources.',
      faction: 'general',
    },
    {
      text: '**MCV Efficiency:** When your MCV is idle, move it closer to your desired build location to speed up construction.',
      faction: 'general',
    },
    {
      text: '**Hotkeys:** With default hotkeys, pressing the spacebar centers your screen on the most recent event.',
      faction: 'general',
    },
    {
      text: '**Ore Miners:** Ore Miners (harvesters) are produced from the Ore Refinery.',
      faction: 'general',
    },
    {
      text: '**Engineers:** Engineers capture neutral buildings instantly, with no delay.',
      faction: 'general',
    },
    {
      text: '**Match Loss Condition:** If you lose all your buildings, you lose the match immediately, even if defensive structures remain.',
      faction: 'general',
    },
    {
      text: '**Unit Selection:** You can select multiple unit groups by holding Shift and dragging over them.',
      faction: 'general',
    },
    { text: '**Health Bars:** Press Shift + Space to toggle health bars.', faction: 'general' },
    {
      text: '**Unit Scatter:** When spreading units with the X key, they disperse based on their center of mass.',
      faction: 'general',
    },
    {
      text: '**Select All of Type:** Pressing W selects all units of the same type on screen. Pressing it twice selects them across the entire map.',
      faction: 'general',
    },
    {
      text: '**Attack-Move:** Press A to command units to attack-move toward a destination.',
      faction: 'general',
    },
    {
      text: '**Dog vs. Bear:** On land, Attack Dogs run faster than War Bears, but they swim slower in water.',
      faction: 'general',
    },
    {
      text: '**Dog vs. Bear Engagement:** When Dogs and Bears engage each other, numbers are the deciding factor.',
      faction: 'general',
    },
    {
      text: '**Reporting Bugs:** If someone is exploiting a banned bug, report them immediately.',
      faction: 'general',
    },
    {
      text: '**Artillery vs. Defenses:** Long-range artillery is highly effective against defensive structures.',
      faction: 'general',
    },
    {
      text: "**Aggressive Mode:** In Aggressive Mode, issuing commands does not change the unit's current attack target.",
      faction: 'general',
    },

    // Allies
    {
      text: '**Allies - Core Strength:** Allied strength lies in their infantry and air units. They have the strongest infantry in the game, but their armored units are relatively weak. They are considered the most micro-intensive faction.',
      faction: 'allies',
    },
    {
      text: '**Allies - Cryocopter:** A group of 5+ Cryocopters can effectively shut down enemy power plants. **Note!** You cannot freeze Soviet Super Reactors. Frozen units and structures become very brittle and can be destroyed by a single shot from almost any weapon.',
      faction: 'allies',
    },
    {
      text: "**Allies - Guardian Tank:** Use the 'Force-Move' command (key `G`) to make your tanks run over enemy infantry, crushing them instantly.",
      faction: 'allies',
    },
    {
      text: '**Allies - Expansion:** As soon as your first Refinery is complete, produce a Prospector and send it to a second ore node. The Prospector can unpack into a new base, which is key for fast economic development.',
      faction: 'allies',
    },
    {
      text: "**Allies - Vindicator Rush:** A powerful early-game strategy, especially against Empire. Build an Airfield quickly and use Vindicators to bomb enemy refineries and harvesters. Research the 'Advanced Aeronautics' protocol to increase their damage.",
      faction: 'allies',
    },
    {
      text: '**Allies - Riptide Harassment:** Load a Riptide ACV with 5 Javelin Troopers for a fast, amphibious harassment squad. This is excellent for early pressure and can quickly take out undefended ore collectors or scout for enemy expansions.',
      faction: 'allies',
    },
    {
      text: '**Allies - Mobile Repair:** Load an Engineer into a Multigunner IFV to create a mobile repair vehicle. A group of Guardian Tanks supported by these repair IFVs can be very difficult to stop, similar to the Terran Marine/Medic combo in StarCraft.',
      faction: 'allies',
    },
    {
      text: "**Allies - Countering Terror Drones:** Soviet Terror Drones are a major threat to Prospectors. The most effective counter is to build walls between your Refinery and the ore node, blocking the Terror Drone's path.",
      faction: 'allies',
    },
    {
      text: '**Allies - Fast Airbase:** For a fast Allied airbase, you can build it immediately after your power plant.',
      faction: 'allies',
    },
    {
      text: "**Allies - Attack Dog Ability:** The effectiveness of the Attack Dog's ability can be improved with the High Technology Protocol, although its range remains unchanged.",
      faction: 'allies',
    },
    {
      text: '**Allies - Century Bomber Drops:** Tanya and Engineers can parachute into the water from a Century Bomber flying over the sea.',
      faction: 'allies',
    },
    {
      text: "**Allies - Athena Cannon Weakness:** Athena Cannons' Aegis Shields are vulnerable from directly above, so use air units to exploit this.",
      faction: 'allies',
    },
    {
      text: '**Allies - Frozen Units:** Frozen units can be destroyed instantly with even minimal damage.',
      faction: 'allies',
    },
    {
      text: '**Allies - Guardian Laser Targeting:** Guardian Tank laser targeting does not stack, so one tank in laser mode is sufficient.',
      faction: 'allies',
    },
    {
      text: '**Allies - Peacekeeper Vulnerability:** Peacekeepers in Riot Shield mode are highly vulnerable to certain attacks, such as Molotov cocktails and Vindicator bombs.',
      faction: 'allies',
    },
    {
      text: '**Allies - Peacekeeper Back:** Avoid exposing the back of Peacekeepers to enemy fire. Even with Riot Shields, they take significant damage.',
      faction: 'allies',
    },
    {
      text: '**Allies - Vindicator vs. Bullfrog:** Did you know that a Vindicator can destroy a Bullfrog using only four bombs?',
      faction: 'allies',
    },
    {
      text: '**Allies - Attack Dog Weakness:** Attack Dogs are vulnerable to Peacekeepers and Imperial Warriors, so consider avoiding direct encounters when you spot them.',
      faction: 'allies',
    },

    // Soviets
    {
      text: '**Soviets - Core Strength:** The Soviets dominate on land with powerful late-game units. However, they are slow to tech up and maneuver. Their primary weakness is air power.',
      faction: 'soviets',
    },
    {
      text: '**Soviets - Super Reactor:** The Super Reactor is a massive power source, but it is **highly unstable**. When destroyed, it explodes, dealing massive damage (1500) over a large radius (250), even to flying units. Always build it away from key structures and never attack it up close.',
      faction: 'soviets',
    },
    {
      text: '**Soviets - Terror Drone:** Excellent for wrecking the enemy economy. It slips into enemy vehicles (especially harvesters) and destroys them from within. To counter it, use repairs (e.g., from an IFV or Crusher Crane) or walls to block access to refineries.',
      faction: 'soviets',
    },
    {
      text: '**Soviets - Twinblade:** Very powerful in groups. The best protection for Twinblades against Apollo fighters are Soviet Bullfrogs, which have longer range and deal high damage to air units.',
      faction: 'soviets',
    },
    {
      text: '**Soviets - Conscript:** Although weak in direct combat, its Molotov cocktail ability makes it the best garrison-clearing unit in the entire game. A single Conscript can clear a building full of enemy infantry.',
      faction: 'soviets',
    },
    {
      text: '**Soviets - Sickle:** Its main advantage is the ability to jump (F), allowing it to bypass cliffs and obstacles. This is ideal for harassing enemy bases and getting behind enemy lines.',
      faction: 'soviets',
    },
    {
      text: '**Soviets - Crane Build Order:** Starting with a Crusher Crane allows you to build multiple structures simultaneously. A common opening is: Crane -> Reactor -> Barracks -> Refinery -> War Factory, all while the Crane builds a second Refinery or defenses.',
      faction: 'soviets',
    },
    {
      text: '**Soviets - Stingray:** An excellent early-game naval unit. Its special ability, Tesla Surge, can devastate clustered enemy ships but disables the Stingray temporarily. Use it for hit-and-run attacks.',
      faction: 'soviets',
    },
    {
      text: '**Soviets - Shrunk Apocalypse Tank:** A shrunk Apocalypse Tank can be crushed by any tank.',
      faction: 'soviets',
    },
    {
      text: '**Soviets - Terror Drone vs. Infantry:** Terror Drones can quickly eliminate dolphins and infantry.',
      faction: 'soviets',
    },
    {
      text: '**Soviets - Elite Conscripts:** Elite Conscripts can throw Molotov cocktails into many buildings from outside their defensive range.',
      faction: 'soviets',
    },
    {
      text: '**Soviets - Twinblade + Bullfrog Combo:** The Twinblade plus Bullfrog combo is very effective.',
      faction: 'soviets',
    },
    {
      text: '**Soviets - Crusher Crane Infiltration:** Infiltrating Soviet Crusher Cranes with Spies or Shinobi has no benefit, aside from giving others a laugh.',
      faction: 'soviets',
    },

    // Empire
    {
      text: '**Empire - Core Strength:** The Imperial navy is undisputedly the strongest on water. Their units are highly mobile and versatile (transformation ability), but many are expensive and fragile.',
      faction: 'empire',
    },
    {
      text: "**Empire - Tankbuster:** Its 'Burrow' ability makes it immune to crushing and increases its defense, **but it cannot move or attack while burrowed.** Excellent for setting up ambushes and defense.",
      faction: 'empire',
    },
    {
      text: '**Empire - Mecha Tengu/Jet Tengu:** One of the most versatile units in the game. In ground mode (Mecha), it excels at harassing harvesters and killing infantry. In air mode (Jet), it is a solid anti-air unit that never needs to reload.',
      faction: 'empire',
    },
    {
      text: "**Empire - Chopper VX:** In helicopter mode, a group of 7+ Chopper VXs can decimate a base in seconds. They are very weak against infantry. In ground mode, with the 'Advanced Rocket Pods' upgrade, they become a powerful anti-air unit.",
      faction: 'empire',
    },
    {
      text: "**Empire - Rocket Angel:** Powerful base-killers, but very vulnerable to anti-air fire. Use cheaper Jet Tengus as 'cannon fodder' to draw fire away from your Rocket Angels.",
      faction: 'empire',
    },
    {
      text: '**Empire - Fast Tech:** Empire can tech up very quickly. A build order of Dojo -> Reactor -> Refinery -> Reactor -> Mecha Bay -> Dock -> Mainframe allows for a fast Tier 3, giving access to powerful units like the King Oni and Shogun Battleship.',
      faction: 'empire',
    },
    {
      text: '**Empire - Superior Scouting:** The Burst Drone is arguably the best early scout. It flies, detects stealth, and can hover over Soviet construction yards to see exactly what buildings they are producing.',
      faction: 'empire',
    },
    {
      text: '**Empire - Naval Dominance:** The Imperial Shogun Battleship is the strongest naval unit in the game. Support it with Sea Wings for anti-air and Rocket Angels for additional firepower to create an unstoppable late-game fleet.',
      faction: 'empire',
    },
    {
      text: '**Empire - Tengu + Chopper VX Combo:** The Tengu plus Chopper VX combination is very effective.',
      faction: 'empire',
    },
    {
      text: '**Empire - Imperial Warrior vs. Attack Dog:** Attack Dogs are vulnerable to Imperial Warriors, so consider avoiding direct encounters when you spot them.',
      faction: 'empire',
    },

    // Advanced tactics
    {
      text: '**Power Sabotage:** Attacking enemy power plants is always a good idea. For Allies, a power outage **increases the cost** of units and structures being produced until power is restored. For other factions, it simply slows production.',
      faction: 'general',
    },
    {
      text: '**Fake Building:** You can deceive your opponent by starting construction of a structure (e.g., hinting at a specific strategy) and then canceling it. This may force the enemy to prepare for something that never comes.',
      faction: 'general',
    },
    {
      text: '**Countering Tower Pushes:** If an Allied player is pushing with Multigunner Turrets, their main base is often left vulnerable. Use fast harassment units like Mecha Tengus or Riptides to flank around and destroy their refineries and power plants. A single Twinblade with Flak Troopers can also devastate an undefended base.',
      faction: 'general',
    },
    {
      text: '**Chronosphere Offense:** The Allied Chronosphere can be used as a weapon. Teleport enemy land units into water to destroy them instantly, or teleport naval units onto land. Amphibious units can be destroyed by teleporting them into impassable terrain.',
      faction: 'allies',
    },
    {
      text: '**Soviet Repair:** Soviet vehicles cannot repair themselves without a Crusher Crane or Garage. Use hit-and-run guerrilla tactics against Soviet armor in the early-to-mid game to whittle them down, as they cannot easily recover.',
      faction: 'soviets',
    },
    {
      text: '**Scatter Key (X):** When your infantry is under attack from area-of-effect weapons like Sickles or Tesla Troopers, use the Scatter key (`X`) to spread them out and minimize losses.',
      faction: 'general',
    },
    {
      text: '**Oil Derricks:** Always prioritize capturing oil derricks early in the game. The additional income can provide a significant economic advantage, especially in the early stages.',
      faction: 'general',
    },
    {
      text: '**Naval Importance:** On maps with water, controlling the sea is crucial. Naval units are powerful and can provide support for land attacks or directly assault coastal bases. Build a Naval Yard early to secure resources and apply pressure.',
      faction: 'general',
    },
    {
      text: "**Use Support Powers:** Don't forget to use your faction's support powers! They are free and can turn the tide of battle. Magnetic Satellite can disable vehicles, Orbital Drop can reinforce your army anywhere, and Time Bomb can wipe out key structures.",
      faction: 'general',
    },
    {
      text: '**Selling MCV for Rush:** If you want a quick, aggressive push, consider selling your MCV for an instant cash boost.',
      faction: 'general',
    },
    {
      text: '**Stalemate Break:** In a stalemate, consider teching up and incorporating naval or air units.',
      faction: 'general',
    },

    // Trivia & Fun Facts
    {
      text: '**Trivia:** In patch 1.11, the range of infantry in garrisons was reduced from 100% to 75% to weaken defensive camping. This makes clearing buildings easier, but attacking from long range is now even more effective.',
      faction: 'trivia',
    },
    {
      text: '**Trivia:** When a Soviet Super Reactor is destroyed, it leaves behind a field of radiation that is lethal to infantry.',
      faction: 'trivia',
    },
    {
      text: '**Trivia:** The Soviet Crusher Crane allows for simultaneous construction of multiple buildings, significantly speeding up base development compared to Allies and Empire.',
      faction: 'trivia',
    },
    {
      text: "**Trivia:** The 'Hell March 3' theme was composed by Frank Klepacki and features vocals by the Russian choir 'Alexandrov Ensemble'.",
      faction: 'trivia',
    },
    {
      text: '**Trivia:** Tim Curry, who plays Premier Cherdenko, also played Dr. Frank-N-Furter in *The Rocky Horror Picture Show*.',
      faction: 'trivia',
    },
    {
      text: '**Trivia:** George Takei (Emperor Yoshiro), J.K. Simmons (President Ackerman), and Jenny McCarthy (Tanya) are among the star-studded cast.',
      faction: 'trivia',
    },
    {
      text: '**Trivia:** Red Alert 3 was the first game in the series to feature a fully cooperative campaign mode.',
      faction: 'trivia',
    },
    {
      text: '**Tip:** Watch replays of your losses to learn from mistakes. You can find replays in your user folder under `Documents\\Red Alert 3\\Replays`.',
      faction: 'general',
    },
    {
      text: '**Community Tip:** Join the official C&C Discord or Reddit to find practice partners and stay updated on tournaments.',
      faction: 'general',
    },
    { text: '**Trivia:** Ore Miners are produced from the Ore Refinery.', faction: 'trivia' },
    {
      text: '**Trivia:** Engineers capture neutral buildings instantly, with no delay.',
      faction: 'trivia',
    },
  ];
}
