"use client";
import type { HeadToHeadResult } from "../product/head-to-head";
export function ResultProof({result}:{result:HeadToHeadResult}){return <section className="result-block" aria-label="Position examples"><div className="sample-rail">{result.examples.map(example=><article key={example.title}><strong>{example.title}</strong><p>{result.targetId} finishes {example.finalMargin} point{example.finalMargin===1?"":"s"} ahead.</p><details><summary>Show upcoming race positions</summary><ol>{example.events.map(event=><li key={event}>{event}</li>)}</ol></details></article>)}</div></section>}
