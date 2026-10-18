import { describeSkill, runSkillCases } from "../../../../evals/src/index.js";
import { cases } from "./dependency-checker.cases.js";

describeSkill("dependency-checker", () => runSkillCases("dependency-checker", cases));
