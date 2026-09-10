import type { GuaranteedScenario } from "../product/guaranteed-scenarios";

export function GuaranteedScenarioList({ items }: { items:readonly GuaranteedScenario[] }) {
  return <ol className="guarantee-list">
    {items.map((scenario, index) => <li key={scenario.key} className="guarantee-card">
      <header>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <div><p>Additional points</p><strong>+{scenario.additionalPoints}</strong></div>
        <div><p>Projected total</p><strong>{scenario.finalPoints}</strong></div>
      </header>
      <div className="guarantee-card__sessions">
        <section><p className="eyebrow">Race finishes</p><div className="finish-chips">{scenario.races.map(group => <span key={group.key}><b>{group.label}</b><i>× {group.count} {group.count === 1 ? "race" : "races"}</i><small>{group.pointsEach} pts each</small></span>)}</div></section>
        <section className="sprint-result"><p className="eyebrow">Sprint result</p><strong>{scenario.sprint.label}</strong><span>{scenario.sprint.points} points</span></section>
      </div>
    </li>)}
  </ol>;
}
