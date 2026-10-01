import { useCallback, useState } from "react";

/** useState que recuerda su valor en este dispositivo (preferencias: columnas, último vendedor…). */
export function useGuardado<T>(clave: string, inicial: T) {
  const [valor, setValor] = useState<T>(() => {
    try {
      const guardado = localStorage.getItem(`karinca.${clave}`);
      return guardado === null ? inicial : (JSON.parse(guardado) as T);
    } catch {
      return inicial;
    }
  });
  const guardar = useCallback(
    (nuevo: T) => {
      setValor(nuevo);
      try {
        localStorage.setItem(`karinca.${clave}`, JSON.stringify(nuevo));
      } catch {
        // Sin almacenamiento (modo privado): la preferencia dura lo que dure la pestaña.
      }
    },
    [clave],
  );
  return [valor, guardar] as const;
}
