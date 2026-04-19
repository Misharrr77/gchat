/** Склонение «подписчик» для русского */
export function formatSubscriberCount(n: number): string {
  const v = Math.abs(Math.floor(n));
  const n100 = v % 100;
  const n10 = v % 10;
  if (n100 >= 11 && n100 <= 14) return `${v} подписчиков`;
  if (n10 === 1) return `${v} подписчик`;
  if (n10 >= 2 && n10 <= 4) return `${v} подписчика`;
  return `${v} подписчиков`;
}
