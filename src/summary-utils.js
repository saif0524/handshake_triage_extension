export function buildSummaryCounts(results) {
  const counts = {
    total: results.length,
    high: 0,
    medium: 0,
    low: 0,
    risky: 0,
    follow_up_needed: 0
  };
  for (const item of results) {
    const c = item.classification || {};
    if (c.priority === "High") counts.high += 1;
    else if (c.priority === "Medium") counts.medium += 1;
    else counts.low += 1;
    if (c.is_risky) counts.risky += 1;
    if (c.needsReply) counts.follow_up_needed += 1;
  }
  return counts;
}

export function buildExportSummary({ source, results, timestamp = new Date().toISOString() }) {
  const summary_counts = buildSummaryCounts(results);
  return {
    timestamp,
    source,
    total_messages_analyzed: summary_counts.total,
    summary_counts,
    messages: results.map(({ message, classification }) => ({
      id: message?.id || null,
      category: classification?.category || null,
      priority_score: classification?.priority_score || 0,
      urgency: classification?.urgency || "Low",
      sender: message?.sender || null,
      recommended_action: classification?.recommended_action || null,
      why_this_matters: classification?.why_this_matters || null,
      risk_flags: classification?.riskFlags || []
    }))
  };
}
