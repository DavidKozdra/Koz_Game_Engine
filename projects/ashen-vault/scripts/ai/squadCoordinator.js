"use strict";

function assignRoles(agents) {
  const list = Array.isArray(agents) ? agents : [];
  return list.map((agent, index) => {
    if (!agent) return null;
    if (index === 0) return { ...agent, role: "guard" };
    if (index === 1) return { ...agent, role: "flanker" };
    if (index === 2) return { ...agent, role: "acolyte" };
    return { ...agent, role: "guard" };
  }).filter(Boolean);
}

function buildFormationAnchor(playerCell, role) {
  const anchor = {
    x: Number(playerCell && playerCell.x) || 0,
    y: Number(playerCell && playerCell.y) || 0,
  };
  if (role === "flanker") {
    anchor.x += 2;
    anchor.y += 1;
  } else if (role === "acolyte") {
    anchor.x -= 2;
    anchor.y -= 2;
  } else {
    anchor.x += 0;
    anchor.y += 0;
  }
  return anchor;
}

function coordinateSquad(agents, playerCell) {
  return assignRoles(agents).map((agent) => ({
    id: agent.id,
    role: agent.role,
    anchor: buildFormationAnchor(playerCell, agent.role),
  }));
}

module.exports = {
  assignRoles,
  buildFormationAnchor,
  coordinateSquad,
};
