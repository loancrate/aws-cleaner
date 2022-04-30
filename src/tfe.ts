import got from "got";

export interface TerraformConfig {
  token: string;
  organization: string;
}

export interface TerraformWorkspace {
  id: string;
  name: string;
}

export async function getTerraformWorkspaces({ token, organization }: TerraformConfig): Promise<TerraformWorkspace[]> {
  const result: TerraformWorkspace[] = [];
  const client = got.extend({
    prefixUrl: "https://app.terraform.io/api/v2",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  for (let pageNumber = 1; ; ++pageNumber) {
    const data: any = await client
      .get(`organizations/${organization}/workspaces`, {
        searchParams: {
          "page[number]": pageNumber,
          "page[size]": 100,
        },
      })
      .json();
    for (const item of data.data) {
      const { id } = item;
      const { name } = item.attributes;
      result.push({ id, name });
    }
    if (!data.meta.pagination["next-page"]) break;
  }
  return result;
}
