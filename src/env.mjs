/** Primera variable definida en `names`, si ninguna existe devuelve `fallback`. */
export function envFirst(names, fallback = undefined) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== "") return value;
  }
  return fallback;
}