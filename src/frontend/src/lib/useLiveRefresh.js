import { useEffect, useRef } from 'react';
import { onServerEvent, onReconnect } from './serverLink';

// Calls reload() when the server says something changed (any of these broadcast events) and when
// it comes back after being away. A burst of events (e.g. many finished voice clips) gives one reload.
//   events: departments_updated, users_updated, settings_updated, announcements_updated,
//           voice_updated, license_updated
// Don't use it to reload a form the person is typing in: keep to lists and read-only data.
export function useLiveRefresh(events, reload) {
  const ref = useRef(reload);
  ref.current = reload;
  const key = events.join(',');

  useEffect(() => {
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => ref.current(), 400); };
    const offs = key.split(',').map(ev => onServerEvent(ev, refresh));
    offs.push(onReconnect(refresh));
    return () => { clearTimeout(timer); offs.forEach(off => off()); };
  }, [key]);
}
