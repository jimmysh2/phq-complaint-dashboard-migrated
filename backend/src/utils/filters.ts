export interface DashboardFilters {
  districtIds?: string;
  policeStationIds?: string;
  officeIds?: string;
  classOfIncident?: string;
  from_date?: Date;
  to_date?: Date;
}

const parseCsv = (value: unknown) =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const parseBigIntCsv = (value: unknown): bigint[] =>
  parseCsv(value)
    .map((item) => (/^-?\d+$/.test(item) ? BigInt(item) : null))
    .filter((item): item is bigint => item !== null);

export const buildPrismaWhereClause = (query: any) => {
  const where: any = {};

  const districtIds = parseBigIntCsv(query.districtIds);
  if (districtIds.length > 0) {
    where.districtMasterId = { in: districtIds };
  }

  const policeStationIds = parseBigIntCsv(query.policeStationIds);
  if (policeStationIds.length > 0) {
    where.policeStationMasterId = { in: policeStationIds };
  }

  const officeIds = parseBigIntCsv(query.officeIds);
  if (officeIds.length > 0) {
    where.officeMasterId = { in: officeIds };
  }

  const classOfIncident = parseCsv(query.classOfIncident);
  if (classOfIncident.length > 0) {
    if (classOfIncident.includes('Unmapped')) {
      const nonUnmapped = classOfIncident.filter(c => c !== 'Unmapped');
      where.OR = where.OR || [];
      where.OR.push({
        OR: [
          { classOfIncident: { in: nonUnmapped } },
          { classOfIncident: null },
          { classOfIncident: '' },
          { classOfIncident: ' ' }
        ]
      });
    } else {
      where.classOfIncident = { in: classOfIncident };
    }
  }

  const fromDate = query.from_date || query.fromDate;
  const toDate = query.to_date || query.toDate;
  if (fromDate || toDate) {
    where.complRegDt = {};
    if (fromDate) {
      where.complRegDt.gte = new Date(fromDate as string);
    }
    if (toDate) {
      const endOfDay = new Date(toDate as string);
      endOfDay.setUTCHours(23, 59, 59, 999);
      where.complRegDt.lte = endOfDay;
    }
  }

  return where;
};
