import { PROOF, hasProof } from "./proof-content";
import styles from "./homepage.module.css";

/** Churches, a count and short quotes under the hero. Filled from proof-content.ts. */
export default function ProofStrip() {
  if (!hasProof()) {
    if (process.env.NODE_ENV === "production") return null;
    return (
      <section className={`${styles.proofStrip} ${styles.proofPlaceholder}`} aria-label="Proof strip placeholder">
        <p><strong>Proof strip (only shown in development).</strong> Add a church count, church names or logos, and two or three short quotes in <code>app/proof-content.ts</code>.</p>
      </section>
    );
  }
  return (
    <section className={styles.proofStrip} aria-label="Churches using MakeChurchEazy">
      {(PROOF.churchCount || PROOF.churches.length > 0) && (
        <div className={styles.proofTop}>
          {PROOF.churchCount && <p className={styles.proofCount}><strong>{PROOF.churchCount}</strong> {PROOF.churchCountLabel}</p>}
          {PROOF.churches.length > 0 && (
            <ul className={styles.proofChurches}>
              {PROOF.churches.map((church) => (
                <li key={church.name}>{church.logo ? <img src={church.logo} alt={church.name} height={36} loading="lazy" /> : church.name}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {PROOF.quotes.length > 0 && (
        <ul className={styles.proofQuotes}>
          {PROOF.quotes.slice(0, 3).map((q) => (
            <li key={q.name + q.church}>
              <blockquote>“{q.quote}”</blockquote>
              <p><strong>{q.name}</strong>, {q.role} · {q.church}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
