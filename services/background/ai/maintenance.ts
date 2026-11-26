const ALARM = 'octablaster-ai-retention';
/** Alarme do navegador continua funcionando quando o background MV3 é suspenso. */
export function scheduleAiMaintenance(cleanup: () => Promise<unknown>, api = browser) {
  if (!api.alarms) return;
  api.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) void cleanup().catch(() => {}); });
  void api.alarms.get(ALARM).then(existing => {
    if (!existing) return api.alarms.create(ALARM, { periodInMinutes: 60 });
  }).catch(() => {});
}
