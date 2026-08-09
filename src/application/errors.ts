export class IncidentNotFoundError extends Error {
  constructor(id: string) {
    super(`Incident ${id} was not found.`);
    this.name = "IncidentNotFoundError";
  }
}

export class IncidentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncidentConflictError";
  }
}
