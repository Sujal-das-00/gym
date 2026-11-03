import { useState } from "react";
import { niceScale } from "../lib/trend.js";
import { currency } from "../lib/dates.js";

// Full numbers on an axis that stays under 10,000, compact (K / L) once it reaches it.
function axisLabel(value, top) {
  if (value === 0) return "0";
  if (top < 10000) return value.toLocaleString("en-IN");
  if (value >= 100000) return `${+(value / 100000).toFixed(1)}L`;
  return `${+(value / 1000).toFixed(1)}K`;
}

/**
 * Columns for one measure over time: thin (24px at most), the data end rounded
 * and the base square, a 2px gap between neighbours, hairline grid. Hovering or
 * focusing a column names it in a tooltip; every value is also listed in the
 * Daily operations rows, so the chart is never the only place a number lives.
 *
 * points: [{ key, label, title, <valueKey> }]; tickEvery: label every Nth column.
 */
export default function ColumnChart({ points, valueKey, tone = "in", tickEvery = 1, ariaLabel }) {
  const [active, setActive] = useState(-1);
  const max = points.reduce((best, point) => Math.max(best, point[valueKey]), 0);
  const { top, ticks } = niceScale(max);
  const tip = active >= 0 ? points[active] : null;
  const tipLeft = tip ? Math.min(88, Math.max(12, ((active + 0.5) / points.length) * 100)) : 0;

  return (
    <figure className={"colchart is-" + tone} role="group" aria-label={ariaLabel}>
      <div className="colchart-plot">
        <div className="colchart-axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: (tick / top) * 100 + "%" }}>
              {axisLabel(tick, top)}
            </span>
          ))}
        </div>
        <div className="colchart-area" onMouseLeave={() => setActive(-1)}>
          {ticks.map((tick) => (
            <i key={tick} className="colchart-grid" style={{ bottom: (tick / top) * 100 + "%" }} aria-hidden="true" />
          ))}
          <div className="colchart-cols">
            {points.map((point, index) => (
              <div
                key={point.key}
                className={"colchart-col" + (index === active ? " is-active" : "")}
                tabIndex={0}
                role="img"
                aria-label={`${point.title}: ${currency(point[valueKey])}`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(-1)}
              >
                <span className="colchart-bar" style={{ height: point[valueKey] > 0 ? Math.max(3, (point[valueKey] / top) * 100) + "%" : "0" }} />
              </div>
            ))}
          </div>
          {tip ? (
            <div className="colchart-tip" style={{ left: tipLeft + "%" }} role="status">
              <small>{tip.title}</small>
              <strong>{currency(tip[valueKey])}</strong>
            </div>
          ) : null}
        </div>
      </div>
      <div className="colchart-x" aria-hidden="true">
        {points.map((point, index) => (
          <span key={point.key}>{index % tickEvery === 0 ? point.label : ""}</span>
        ))}
      </div>
    </figure>
  );
}
