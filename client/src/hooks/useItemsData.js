import { useEffect, useRef, useState } from "react";
import itemsData from "../data/items.json";
import namesData from "../data/items_names.json";
import {
  buildItemIndex,
  buildNameLookup,
  collectItemEntries,
  getItemDataSource,
} from "../features/recipeSimulator/recipeSimulatorLogic";

export function useItemsData(language) {
  const [itemNameLookup, setItemNameLookup] = useState({});
  const [itemsIndex, setItemsIndex] = useState([]);
  const [itemDefs, setItemDefs] = useState({});
  const itemDefsRef = useRef({});

  useEffect(() => {
    setItemNameLookup(buildNameLookup(namesData, language));
  }, [language]);

  useEffect(() => {
    const data = getItemDataSource(itemsData);
    const { entries, defs } = collectItemEntries(data);
    itemDefsRef.current = defs;
    setItemDefs(defs);

    const { itemsIndex: nextIndex } = buildItemIndex(
      entries,
      itemNameLookup,
      defs,
    );
    setItemsIndex(nextIndex);
  }, [itemNameLookup]);

  return { itemNameLookup, itemsIndex, itemDefs, itemDefsRef };
}
