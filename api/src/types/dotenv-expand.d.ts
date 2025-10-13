declare module "dotenv-expand" {
  import { DotenvConfigOutput } from "dotenv";
  export function expand(config: DotenvConfigOutput): DotenvConfigOutput;
  export default { expand };
}
