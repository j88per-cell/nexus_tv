async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${path} failed: ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listMedia: (params = {}) => request(`/media?${new URLSearchParams(params)}`),
  listShows: () => request('/media/shows'),
  listGroups: () => request('/media/groups'),
  createGroup: (body) => request('/media/groups', { method: 'POST', body: JSON.stringify(body) }),
  deleteGroup: (id) => request(`/media/groups/${id}`, { method: 'DELETE' }),

  listChannels: () => request('/channels'),
  getChannel: (id) => request(`/channels/${id}`),
  createChannel: (body) => request('/channels', { method: 'POST', body: JSON.stringify(body) }),
  updateChannel: (id, body) => request(`/channels/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  setChannelRule: (id, body) => request(`/channels/${id}/rule`, { method: 'PUT', body: JSON.stringify(body) }),
  addOverride: (id, body) => request(`/channels/${id}/overrides`, { method: 'POST', body: JSON.stringify(body) }),
  removeOverride: (id, overrideId) => request(`/channels/${id}/overrides/${overrideId}`, { method: 'DELETE' }),
  startChannel: (id) => request(`/channels/${id}/start`, { method: 'POST' }),
  stopChannel: (id) => request(`/channels/${id}/stop`, { method: 'POST' }),
  restartChannel: (id) => request(`/channels/${id}/restart`, { method: 'POST' }),

  getEpg: (id, hours = 24) => request(`/channels/${id}/epg?hours=${hours}`),
  getAllEpg: (hours = 24) => request(`/channels/epg/all?hours=${hours}`),
};
