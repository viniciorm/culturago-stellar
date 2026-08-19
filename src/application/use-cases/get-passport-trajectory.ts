import { DatabaseGateway } from '../../ports/DatabaseGateway';
import { PassportProjection, projectPassport } from '../../domain/passport/passport';

export async function getPassportTrajectory(
  deps: { db: DatabaseGateway },
  subjectId: string
): Promise<PassportProjection> {
  const credentials = await deps.db.listCredentialsBySubject(subjectId);
  return projectPassport(subjectId, credentials);
}
