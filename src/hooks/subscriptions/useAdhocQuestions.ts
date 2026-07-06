import { useState, useEffect } from "react";
import { subscribeToAdhocQuestions } from "../../api/firestore";
import type { AdhocQuestion } from "../../types";

export function useAdhocQuestions(): AdhocQuestion[] {
  const [questions, setQuestions] = useState<AdhocQuestion[]>([]);
  useEffect(() => subscribeToAdhocQuestions(setQuestions), []);
  return questions;
}
