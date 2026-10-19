import { useState, useEffect } from "react";
import { subscribeToStudentQueries } from "../../api/studentQueries";
import type { StudentQuery } from "../../types";

export function useStudentQueries(): StudentQuery[] {
  const [queries, setQueries] = useState<StudentQuery[]>([]);
  useEffect(() => subscribeToStudentQueries(setQueries), []);
  return queries;
}
