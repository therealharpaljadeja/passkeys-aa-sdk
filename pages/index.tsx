import { TurnkeyClient } from "@turnkey/http";
import {
    LightSmartContractAccount,
    getDefaultLightAccountFactory,
} from "@alchemy/aa-accounts";
import { AlchemyProvider } from "@alchemy/aa-alchemy";
import { LocalAccountSigner, SmartAccountSigner } from "@alchemy/aa-core";
import { createAccount } from "@turnkey/viem";
import axios from "axios";
import { WebauthnStamper } from "@turnkey/webauthn-stamper";
import { useState } from "react";
import { createWalletClient, http, toHex } from "viem";
import { sepolia } from "viem/chains";

type subOrgFormData = {
    subOrgName: string;
};

type signingFormData = {
    messageToSign: string;
};

const generateRandomBuffer = (): ArrayBuffer => {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return arr.buffer;
};

const base64UrlEncode = (challenge: ArrayBuffer): string => {
    return Buffer.from(challenge)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
};

type TPrivateKeyState = {
    id: string;
    address: string;
} | null;

type TSignedMessage = {
    message: string;
    signature: string;
} | null;

const humanReadableDateTime = (): string => {
    return new Date()
        .toLocaleString()
        .replaceAll("/", "-")
        .replaceAll(":", ".");
};

export default function Home() {
    const [subOrgId, setSubOrgId] = useState<string | null>(null);
    const [privateKey, setPrivateKey] = useState<TPrivateKeyState>(null);
    const [signedMessage, setSignedMessage] = useState<TSignedMessage>(null);
    const [transactionHash, setTransactionHash] = useState<string | null>(null);

    const stamper = new WebauthnStamper({
        rpId: "localhost",
    });

    const passkeyHttpClient = new TurnkeyClient(
        {
            baseUrl: process.env.NEXT_PUBLIC_TURNKEY_API_BASE_URL!,
        },
        stamper
    );

    const createPrivateKey = async () => {
        const signedRequest = await passkeyHttpClient.stampCreatePrivateKeys({
            type: "ACTIVITY_TYPE_CREATE_PRIVATE_KEYS_V2",
            organizationId: process.env.NEXT_PUBLIC_ORGANIZATION_ID!,
            timestampMs: String(Date.now()),
            parameters: {
                privateKeys: [
                    {
                        privateKeyName: `ETH Key ${Math.floor(
                            Math.random() * 1000
                        )}`,
                        curve: "CURVE_SECP256K1",
                        addressFormats: ["ADDRESS_FORMAT_ETHEREUM"],
                        privateKeyTags: [],
                    },
                ],
            },
        });

        const response = await axios.post("/api/createKey", signedRequest);

        setPrivateKey({
            id: response.data["privateKeyId"],
            address: response.data["address"],
        });
    };

    const sendUserOperation = async () => {
        if (!privateKey) {
            throw new Error("private key not found");
        }

        const viemAccount = await createAccount({
            client: passkeyHttpClient,
            organizationId: process.env.NEXT_PUBLIC_ORGANIZATION_ID!,
            privateKeyId: privateKey.id,
            ethereumAddress: privateKey.address,
        });

        const owner: SmartAccountSigner = new LocalAccountSigner(viemAccount);

        const provider = new AlchemyProvider({
            apiKey: process.env.NEXT_PUBLIC_ALCHEMY_API!,
            chain: sepolia,
            entryPointAddress: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
        }).connect(
            (rpcClient) =>
                new LightSmartContractAccount({
                    entryPointAddress:
                        "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
                    chain: rpcClient.chain,
                    owner,
                    factoryAddress: getDefaultLightAccountFactory(sepolia),
                    rpcClient,
                })
        );

        provider.withAlchemyGasManager({
            policyId: process.env.NEXT_PUBLIC_POLICY_ID!,
            entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
        });

        const receipt = await provider.sendTransaction({
            from: toHex(privateKey.address),
            to: "0x34A00151460C7Bec401D3b24fE86E9C152EE8284",
            data: "0x6a6278420000000000000000000000005ff137d4b0fdcd49dca30c7cf57e578a026d2789",
        });

        setTransactionHash(receipt);
    };

    return (
        <main className="bg-white h-screen">
            <div className="flex gap-y-2 flex-col items-center justify-center h-full">
                <img
                    src="https://avatars.githubusercontent.com/u/49798644?s=200&v=4"
                    alt="Alchemy Logo"
                    className="w-20"
                />
                <h1 className="text-2xl">Alchemy aa-sdk Passkeys Demo</h1>

                <div>
                    {privateKey && (
                        <div className="text-center">
                            ETH address: <br />
                            <span>{privateKey.address}</span>
                        </div>
                    )}
                </div>

                {!privateKey && (
                    <div className="flex flex-col justify-center gap-y-2">
                        <p className="text-center">
                            First we need to create a Passkey based wallet
                        </p>
                        <button
                            className="flex justify-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                            onClick={createPrivateKey}
                        >
                            Create ETH address
                        </button>
                    </div>
                )}

                {privateKey && (
                    <div className="flex flex-col justify-center gap-y-2">
                        <h2>Now let&apos;s a mint an NFT on Sepolia Chain!</h2>

                        <button
                            className="flex justify-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                            onClick={sendUserOperation}
                        >
                            Mint NFT
                        </button>
                    </div>
                )}
                {transactionHash && (
                    <a
                        href={`https://sepolia.etherscan.io/tx/${transactionHash}`}
                        target="_blank"
                    >
                        <p className="underline">View on Sepolia Explorer</p>
                    </a>
                )}
            </div>
        </main>
    );
}
