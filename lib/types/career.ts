/**
 * lib/types/career.ts — Career grid data structures.
 *
 * These types define the shape of the data the AI produces when it calls
 * the career-grid tools (start_career_grid + add_career_path), which the
 * frontend uses to render the interactive career path visualization.
 */

/** A single role within a career path. */
export interface CareerRole {
  title: string;
  yearsFromStart: string;
  salaryRange: string;
  skills: string[];
  description: string;
  entryPath: string;
  outlook: string;
}

/** A linear career progression track (one column in the grid). */
export interface CareerPath {
  pathName: string;
  recommended: boolean;
  roles: CareerRole[];
}

/** The starting node from which all paths branch. */
export interface StartingPoint {
  label: string;
  description: string;
}

/** Full career grid payload — assembled from start_career_grid + add_career_path. */
export interface CareerGridData {
  title: string;
  startingPoint: StartingPoint;
  paths: CareerPath[];
}
