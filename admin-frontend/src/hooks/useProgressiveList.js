import { startTransition, useEffect, useState } from "react";

const FIRST_PAINT_ROWS = 40;

/**
 * A long list's first rows render straight away; the rest follow as a
 * transition right after, which React can pause for a tap or a keystroke. So
 * opening a screen with hundreds of members paints at once instead of freezing
 * while every row mounts. Once the whole list is in, it stays in.
 */
export default function useProgressiveList(items) {
  const [limit, setLimit] = useState(FIRST_PAINT_ROWS);
  const complete = limit >= items.length;

  useEffect(() => {
    if (complete) return;
    startTransition(() => setLimit(Infinity));
  }, [complete]);

  return complete ? items : items.slice(0, limit);
}
