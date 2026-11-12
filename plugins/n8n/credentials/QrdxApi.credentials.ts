import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  Icon,
  INodeProperties,
} from "n8n-workflow";

export class QrdxApi implements ICredentialType {
  name = "qrdxApi";

  displayName = "QRdx API";

  icon: Icon = {
    light: "file:../icons/qrdx.svg",
    dark: "file:../icons/qrdx.dark.svg",
  };

  documentationUrl = "https://qrdx.dev/docs/developers/api-keys?ref=n8n";

  properties: INodeProperties[] = [
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      typeOptions: { password: true },
      required: true,
      default: "",
      description:
        "A QRdx API key, starting with qrdx_. Create one in QRdx under Settings → API keys & apps. The connection test reads your profile, so give the key full access, or at least the Profile scope.",
    },
    {
      displayName: "Base URL",
      name: "baseUrl",
      type: "string",
      required: true,
      default: "https://api.qrdx.dev/v1",
      description:
        "The QRdx API to use. Change it only for a self-hosted copy of QRdx: your address followed by /api/v1.",
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: "generic",
    properties: {
      headers: {
        Authorization: "=Bearer {{$credentials.apiKey}}",
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: "={{$credentials.baseUrl}}",
      url: "/me",
    },
  };
}
