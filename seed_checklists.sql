DO $$
DECLARE
  cl_id INTEGER;
  base_sort INTEGER;
BEGIN
  SELECT COALESCE(MAX(sort_order), 0) INTO base_sort FROM checklists;

  -- 1. NORTHSIDE OPENING
  INSERT INTO checklists (name, category, description, sort_order, created_by_id, created_by_name)
  VALUES ('Northside Opening', 'opening', 'Northside location opening checklist', base_sort+1, 3, 'David Arendt')
  RETURNING id INTO cl_id;
  INSERT INTO checklist_roles (checklist_id, role) VALUES
    (cl_id,'barista'),(cl_id,'coffee_manager'),(cl_id,'bar_manager');
  INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES
    (cl_id,'Unlock door and turn off alarm 9572',0),
    (cl_id,'Turn on lights',1),
    (cl_id,'Lights on in 4pk fridges',2),
    (cl_id,'Take down chairs',3),
    (cl_id,'Set up espresso/coffee tools/syrups',4),
    (cl_id,'Set up to-go cups',5),
    (cl_id,'Put out pastry case',6),
    (cl_id,'Check/stock milks in left-side fridge',7),
    (cl_id,'Brew 2 air-pots of drip (1 Classic, 1 Barista)',8),
    (cl_id,'Set up tea station w/ water',9),
    (cl_id,'Set out coffee menu(s)',10),
    (cl_id,'Dial in espresso',11),
    (cl_id,'Restock retail coffee',12),
    (cl_id,'Check/stock bathrooms',13),
    (cl_id,'Check tables outside (front and patio)',14),
    (cl_id,'LIGHTS (main area, back patio, neons)',15),
    (cl_id,'MUSIC',16),
    (cl_id,'TVS (ESPN, TNT, AMC, FX)',17),
    (cl_id,'TAPS (all blue stoppers in small pitcher w/ sanny tab)',18),
    (cl_id,'Unlock ALL Doors INCLUDING Emergency Door',19),
    (cl_id,'COFFEE SIGN OUT',20),
    (cl_id,'CHECK SLACK',21);

  -- 2. NORTHSIDE MIDSHIFT
  INSERT INTO checklists (name, category, description, sort_order, created_by_id, created_by_name)
  VALUES ('Northside Midshift', 'other', 'Northside midshift handoff checklist', base_sort+2, 3, 'David Arendt')
  RETURNING id INTO cl_id;
  INSERT INTO checklist_roles (checklist_id, role) VALUES
    (cl_id,'barista'),(cl_id,'coffee_manager'),(cl_id,'bar_manager');
  INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES
    (cl_id,E'── OPENER ──',0),
    (cl_id,'Fill sinks for washing dishes',1),
    (cl_id,'Check lobby and patio for dishes',2),
    (cl_id,'Wash all dishes from opening shift before leaving',3),
    (cl_id,'Restock milks/cereal milk (FIFO)',4),
    (cl_id,'Restock to-go cups and lids',5),
    (cl_id,'Restock coffee tins w/ 140g coffee and roast date',6),
    (cl_id,'Wipe down tables and other surfaces',7),
    (cl_id,'Check cereal milk/start a new batch',8),
    (cl_id,'Check syrup production list/make what is needed',9),
    (cl_id,'Spot sweep if needed',10),
    (cl_id,E'── CLOSER ──',11),
    (cl_id,'Check that espresso is still dialed in',12),
    (cl_id,'Refill espresso hopper',13),
    (cl_id,'Quality check batch brew',14),
    (cl_id,'Set up bar if not already done',15),
    (cl_id,'Refill sinks if needed',16),
    (cl_id,E'── DOWNTIME TASKS ──',17),
    (cl_id,'Check in on customers',18),
    (cl_id,'Tidy espresso and prep stations',19),
    (cl_id,'Stamp sleeves',20),
    (cl_id,'Fill tea tins',21),
    (cl_id,'Wipe tables and surfaces',22),
    (cl_id,'Soak coffee equipment in Cafiza (shot cups, tea steepers/cups, airpots, etc.)',23),
    (cl_id,'Restock beer/spirits/merch',24),
    (cl_id,'Restock 4pks w/ label (left) and nutrition (right)',25),
    (cl_id,'Check weekly/monthly tasks',26);

  -- 3. NORTHSIDE CLOSING
  INSERT INTO checklists (name, category, description, sort_order, created_by_id, created_by_name)
  VALUES ('Northside Closing', 'closing', 'Northside location closing checklist', base_sort+3, 3, 'David Arendt')
  RETURNING id INTO cl_id;
  INSERT INTO checklist_roles (checklist_id, role) VALUES
    (cl_id,'barista'),(cl_id,'coffee_manager'),(cl_id,'bar_manager');
  INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES
    (cl_id,E'── PRE-CLOSE ──',0),
    (cl_id,'Downsize bar tools',1),
    (cl_id,'Wash all dishes',2),
    (cl_id,'Stock/Prep for opener (milks/syrups/cups/tonic)',3),
    (cl_id,'Wipe down tables/straighten up chairs',4),
    (cl_id,'Wipe down surfaces behind bar',5),
    (cl_id,'Restock/organize beer/spirits/merch',6),
    (cl_id,'Restock 4pk fridge',7),
    (cl_id,'Store pastry case',8),
    (cl_id,'Close down one group-head on espresso machine (if possible)',9),
    (cl_id,E'── CLOSING ──',10),
    (cl_id,'Break down coffee prep area',11),
    (cl_id,'Wipe down/store syrup bottles',12),
    (cl_id,'Wipe menus and store in basket (next to drip coffee mugs)',13),
    (cl_id,'Wipe fridge doors',14),
    (cl_id,'Collect/wash all dishes and empty tri-sink',15),
    (cl_id,'Clean/backflush espresso machine (includes surrounding area)',16),
    (cl_id,'STOCK for opener (to-go cups/lids, straws, milks, etc.)',17),
    (cl_id,'Wipe down ALL surfaces',18),
    (cl_id,'Windex Doors/Windows',19),
    (cl_id,'Empty trash and espresso knock box',20),
    (cl_id,'Move knock box and sweep surrounding area',21),
    (cl_id,'Clean top of knock box',22),
    (cl_id,'Move mats and sweep/mop where needed',23),
    (cl_id,'Restock for bartenders as needed',24),
    (cl_id,'Take inventory/SLACK what is low (#barista-86ed)',25);

  -- 4. NORTHSIDE WEEKLY
  INSERT INTO checklists (name, category, description, sort_order, created_by_id, created_by_name)
  VALUES ('Northside Weekly', 'weekly', 'Northside weekly tasks organized by day', base_sort+4, 3, 'David Arendt')
  RETURNING id INTO cl_id;
  INSERT INTO checklist_roles (checklist_id, role) VALUES
    (cl_id,'barista'),(cl_id,'coffee_manager'),(cl_id,'bar_manager');
  INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES
    (cl_id,E'── MONDAY ──',0),
    (cl_id,'Soak/scrub coffee mats (back shelves, airpots, drip coffee mugs, service mats)',1),
    (cl_id,'Soak airpots with stained bottoms',2),
    (cl_id,'Remove everything from tables and wipe down',3),
    (cl_id,'Clean batch brew canister holders',4),
    (cl_id,'Wipe down tea canisters, soak tea equipment in Cafiza',5),
    (cl_id,E'── TUESDAY ──',6),
    (cl_id,'Clean batch grinder (3oz Grindz pellets on fine grind, purge w/ coffee)',7),
    (cl_id,'Deep clean table underneath batch brew (move all mats and wipe clean)',8),
    (cl_id,'Deep clean area around knockbox',9),
    (cl_id,'Deep clean tri-sink (in and under)',10),
    (cl_id,E'── WEDNESDAY ──',11),
    (cl_id,'DEEP CLEAN barista fridge (scrub/wipe inside, FIFO everything)',12),
    (cl_id,'FIFO milks in the cold room',13),
    (cl_id,'Sort ingredient bins and clean beneath (SLACK anything low)',14),
    (cl_id,E'── THURSDAY ──',15),
    (cl_id,'Clean espresso grinders (3oz. Grindz pellets on fine grind, purge w/ coffee)',16),
    (cl_id,'Take mugs off of espresso machine, clean/wipe down top',17),
    (cl_id,'Deep clean pitcher rinser',18),
    (cl_id,'Stock from the storage shed for the weekend! (SLACK what is low)',19),
    (cl_id,E'── FRIDAY ──',20),
    (cl_id,'New releases on display (4pks/bottles) (check slack for info)',21),
    (cl_id,'Clean batch brewer',22),
    (cl_id,'Check level of Bloody Mary mix (recipe in Cocktail Book, par in procedure book)',23),
    (cl_id,'Clean to-go cup holders',24),
    (cl_id,E'── SATURDAY ──',25),
    (cl_id,'Stock/organize/tidy after Saturday rush',26),
    (cl_id,'Clean beneath espresso machine',27),
    (cl_id,'Soak/scrub coffee mats (back shelves, airpots, drip coffee mugs, service mats)',28),
    (cl_id,'FIFO coffee, 5lb & retail (SLACK what is low)',29),
    (cl_id,E'── SUNDAY ──',30),
    (cl_id,'INVENTORY DAY! (#barista86d, *and* Lauren directly)',31),
    (cl_id,'Organize open sleeves box',32),
    (cl_id,'Clean espresso grinders (3oz. Grindz pellets on fine grind, purge w/ coffee)',33),
    (cl_id,'Complete a monthly task',34);

  -- 5. NORTHSIDE MONTHLY
  INSERT INTO checklists (name, category, description, sort_order, created_by_id, created_by_name)
  VALUES ('Northside Monthly', 'monthly', 'Northside monthly deep-clean tasks', base_sort+5, 3, 'David Arendt')
  RETURNING id INTO cl_id;
  INSERT INTO checklist_roles (checklist_id, role) VALUES
    (cl_id,'barista'),(cl_id,'coffee_manager'),(cl_id,'bar_manager');
  INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES
    (cl_id,'Clean/wipe front wall of main bar',0),
    (cl_id,'Sweep/mop beneath all tables behind bar',1),
    (cl_id,'Detail/dust/wipe the two i-beam tables',2),
    (cl_id,'Clean/wipe sofas and side tables',3),
    (cl_id,'Deep clean knock box tube',4),
    (cl_id,'Move mats with coffee plates and clean',5),
    (cl_id,'Windex windows behind espresso machine',6),
    (cl_id,'Deep clean floor drains',7);

  -- 6. MIDTOWN OPENING
  INSERT INTO checklists (name, category, description, sort_order, created_by_id, created_by_name)
  VALUES ('Midtown Opening', 'opening', 'Midtown location opening checklist', base_sort+6, 3, 'David Arendt')
  RETURNING id INTO cl_id;
  INSERT INTO checklist_roles (checklist_id, role) VALUES
    (cl_id,'barista'),(cl_id,'coffee_manager'),(cl_id,'bar_manager');
  INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES
    (cl_id,'Unlock door and turn off alarm 3535',0),
    (cl_id,'Turn on lights',1),
    (cl_id,'Lights on in 4pk fridge',2),
    (cl_id,'Take down chairs',3),
    (cl_id,'Set up espresso/coffee tools/syrups',4),
    (cl_id,'Set up to-go cups',5),
    (cl_id,'Put out pastry case',6),
    (cl_id,'Check/stock milks in left-side fridge',7),
    (cl_id,'Brew 2 air-pots of drip (1 Classic, 1 Barista)',8),
    (cl_id,'Set up tea station w/ water',9),
    (cl_id,'Set out coffee menu(s)',10),
    (cl_id,'Dial in espresso',11),
    (cl_id,'Restock retail coffee',12),
    (cl_id,'Check/stock bathrooms',13),
    (cl_id,'Put out barrels',14),
    (cl_id,'LIGHTS',15),
    (cl_id,'MUSIC',16),
    (cl_id,'TV (ESPN, TNT, AMC, FX)',17),
    (cl_id,'TAPS (all blue stoppers in small pitcher w/ sanny tab)',18),
    (cl_id,'UNLOCK DOOR',19),
    (cl_id,'COFFEE SIGN OUT',20),
    (cl_id,'CHECK SLACK',21);

  -- 7. MIDTOWN MIDSHIFT
  INSERT INTO checklists (name, category, description, sort_order, created_by_id, created_by_name)
  VALUES ('Midtown Midshift', 'other', 'Midtown midshift handoff checklist', base_sort+7, 3, 'David Arendt')
  RETURNING id INTO cl_id;
  INSERT INTO checklist_roles (checklist_id, role) VALUES
    (cl_id,'barista'),(cl_id,'coffee_manager'),(cl_id,'bar_manager');
  INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES
    (cl_id,E'── OPENER ──',0),
    (cl_id,'Fill sinks for washing dishes',1),
    (cl_id,'Check lobby and patio for dishes',2),
    (cl_id,'Wash all dishes',3),
    (cl_id,'Restock milks/cereal milk (FIFO)',4),
    (cl_id,'Restock to-go cups and lids',5),
    (cl_id,'Do quick pars check/flag anything low on Slack (#barista86d)',6),
    (cl_id,'Restock coffee tins w/ 140g coffee and roast date',7),
    (cl_id,'Wipe down tables and other surfaces',8),
    (cl_id,'Check cereal milk/start a new batch',9),
    (cl_id,'Check syrup production list/make what is needed',10),
    (cl_id,'Spot sweep if needed',11),
    (cl_id,E'── CLOSER ──',12),
    (cl_id,'Check that espresso is still dialed in',13),
    (cl_id,'Refill espresso hopper',14),
    (cl_id,'Quality check batch brew',15),
    (cl_id,'Set up bar if not already done',16),
    (cl_id,'Refill sinks if needed',17),
    (cl_id,E'── DOWNTIME TASKS ──',18),
    (cl_id,'Check in on customers',19),
    (cl_id,'Tidy espresso and prep stations',20),
    (cl_id,'Soak coffee equipment in Cafiza (shot cups, tea steepers/cups, airpots, etc.)',21),
    (cl_id,'Wipe tables and surfaces',22),
    (cl_id,'Fill tea tins',23),
    (cl_id,'Restock bathrooms',24),
    (cl_id,'Restock 4pks w/ label (left) and nutrition (right)',25),
    (cl_id,'Check weekly/monthly tasks',26);

  -- 8. MIDTOWN CLOSING
  INSERT INTO checklists (name, category, description, sort_order, created_by_id, created_by_name)
  VALUES ('Midtown Closing', 'closing', 'Midtown location closing checklist', base_sort+8, 3, 'David Arendt')
  RETURNING id INTO cl_id;
  INSERT INTO checklist_roles (checklist_id, role) VALUES
    (cl_id,'barista'),(cl_id,'coffee_manager'),(cl_id,'bar_manager');
  INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES
    (cl_id,E'── PRE-CLOSE ──',0),
    (cl_id,'Downsize bar tools',1),
    (cl_id,'Wash all dishes',2),
    (cl_id,'Stock/Prep for opener (milks/tonic/syrups/cups)',3),
    (cl_id,'Wipe down tables/straighten up chairs',4),
    (cl_id,'Wipe down surfaces behind bar',5),
    (cl_id,'Store pastry case',6),
    (cl_id,'Restock/organize beer/spirits/merch',7),
    (cl_id,'Restock 4pk fridge',8),
    (cl_id,'Flip sinks for bartender, set up back sinks',9),
    (cl_id,'Close down one group-head (if possible)',10),
    (cl_id,E'── CLOSING ──',11),
    (cl_id,'Break down coffee prep area',12),
    (cl_id,'Wipe down/store syrup bottles',13),
    (cl_id,'Wipe down ALL surfaces (including cart!)',14),
    (cl_id,'Wipe fridge doors',15),
    (cl_id,'STOCK for opener (to-go cups/lids, straws, milks, etc.)',16),
    (cl_id,'Stock milks in cold room (FIFO)',17),
    (cl_id,'Break down all to-go cups (stored in back on cart)',18),
    (cl_id,'Wipe and put away menus',19),
    (cl_id,'Clean/backflush espresso machine',20),
    (cl_id,'Dump drain tank/rinse with diluted bleach',21),
    (cl_id,'Wipe down customer facing side of the bar',22),
    (cl_id,'Windex Doors/Windows',23),
    (cl_id,'Empty trash and espresso knock box',24),
    (cl_id,'Clean top of knock box',25),
    (cl_id,'Sweep espresso grounds behind bar/by knock box',26),
    (cl_id,'Sweep grounds/tidy area around drip station',27),
    (cl_id,'Wash all dishes and empty/clean back sink',28),
    (cl_id,'Clean bus tubs',29),
    (cl_id,'Sweep back',30),
    (cl_id,'Restock for bartender (Ice/Cans)',31),
    (cl_id,'Take inventory/SLACK what is low (#barista-86ed)',32);

  -- 9. MIDTOWN WEEKLY
  INSERT INTO checklists (name, category, description, sort_order, created_by_id, created_by_name)
  VALUES ('Midtown Weekly', 'weekly', 'Midtown weekly tasks organized by day', base_sort+9, 3, 'David Arendt')
  RETURNING id INTO cl_id;
  INSERT INTO checklist_roles (checklist_id, role) VALUES
    (cl_id,'barista'),(cl_id,'coffee_manager'),(cl_id,'bar_manager');
  INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES
    (cl_id,E'── MONDAY ──',0),
    (cl_id,'Soak/scrub mats',1),
    (cl_id,'Clean batch brew canister holders',2),
    (cl_id,'Wipe down tea canisters, soak tea equipment in Cafiza',3),
    (cl_id,E'── TUESDAY ──',4),
    (cl_id,'Clean batch grinder (3oz Grindz pellets on fine grind, purge w/ coffee)',5),
    (cl_id,'Soak airpots that stained bottoms',6),
    (cl_id,'Deep clean tri-sink (sink and underneath)',7),
    (cl_id,'Pour 1 cup Bio-Clean down back tri-sink drain',8),
    (cl_id,E'── WEDNESDAY ──',9),
    (cl_id,'DEEP CLEAN barista fridge (scrub/wipe inside, FIFO everything)',10),
    (cl_id,'FIFO milks/wash out bus tubs in the cold room',11),
    (cl_id,'Sort ingredient bins (SLACK anything low)',12),
    (cl_id,E'── THURSDAY ──',13),
    (cl_id,'Clean espresso grinders (3oz. Grindz pellets on fine grind, purge w/ coffee)',14),
    (cl_id,'Take mugs off of espresso machine, clean/wipe down top',15),
    (cl_id,'Deep clean pitcher rinser',16),
    (cl_id,'Clean shelf beneath espresso machine table',17),
    (cl_id,E'── FRIDAY ──',18),
    (cl_id,'New releases on display (4pks/bottles) (check slack for info)',19),
    (cl_id,'Clean batch brewer',20),
    (cl_id,'Mop back (under batch brew station and syrup production)',21),
    (cl_id,'Pour 1/2 cup Bio-Clean down back tri-sink drain',22),
    (cl_id,E'── SATURDAY ──',23),
    (cl_id,'Clean beneath espresso machine',24),
    (cl_id,'FIFO coffee, 5lb & retail (SLACK what is low)',25),
    (cl_id,'Clean to-go cup holders',26),
    (cl_id,E'── SUNDAY ──',27),
    (cl_id,'INVENTORY DAY! (#barista86d, *and* Lauren directly)',28),
    (cl_id,'Organize open sleeves box',29),
    (cl_id,'Clean espresso grinders (3oz. Grindz pellets on fine grind, purge w/ coffee)',30),
    (cl_id,'Complete a monthly task',31);

  -- 10. MIDTOWN MONTHLY
  INSERT INTO checklists (name, category, description, sort_order, created_by_id, created_by_name)
  VALUES ('Midtown Monthly', 'monthly', 'Midtown monthly deep-clean tasks', base_sort+10, 3, 'David Arendt')
  RETURNING id INTO cl_id;
  INSERT INTO checklist_roles (checklist_id, role) VALUES
    (cl_id,'barista'),(cl_id,'coffee_manager'),(cl_id,'bar_manager');
  INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES
    (cl_id,'Clean/wipe front wall and baseboards of main bar',0),
    (cl_id,'Wipe wall behind bar',1),
    (cl_id,'Sweep beneath/around espresso machine/grinder tables',2),
    (cl_id,'Mop back storage area',3),
    (cl_id,'Deep clean knock box tube',4),
    (cl_id,'Soak rinse jug',5),
    (cl_id,'Deep clean beneath tri-sink',6),
    (cl_id,'Scrub mop sink w/ hot water and magic eraser',7),
    (cl_id,'Scrub drains',8);

  -- 11. SYRUP PRODUCTION
  INSERT INTO checklists (name, category, description, sort_order, created_by_id, created_by_name)
  VALUES ('Syrup Production', 'other', 'Daily syrup production checklist', base_sort+11, 3, 'David Arendt')
  RETURNING id INTO cl_id;
  INSERT INTO checklist_roles (checklist_id, role) VALUES
    (cl_id,'barista'),(cl_id,'coffee_manager'),(cl_id,'bar_manager');
  INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES
    (cl_id,'Check syrup inventory list from the previous day',0),
    (cl_id,'Make all syrups needed',1),
    (cl_id,'Slack any ingredients for production that are low',2);

END $$;
