/*
 * Copyright (C) 2025 Christin Löhner
 */

import * as React from 'react';
import { Html } from "@react-email/components";
import { Head } from "@react-email/components";
import { Body } from "@react-email/components";
import { Container } from "@react-email/components";
import { Section } from "@react-email/components";
import { Text } from "@react-email/components";
import { Button } from "@react-email/components";
import { Img } from "@react-email/components";
import { Hr } from "@react-email/components";
import { Tailwind } from "@react-email/components";

interface ResetPasswordEmailProps {
    resetLink: string;
}

export function ResetPasswordEmail({ resetLink }: ResetPasswordEmailProps) {
    return (
        <Html>
            <Head />
            <Tailwind
                config={{
                    theme: {
                        extend: {
                            colors: {
                                'xynoxa-cyan': '#00F2FF',
                                'deep-space-blue': '#0A0A0A',
                                'aurora-mint': '#45E6C5',
                                'nebula-pink': '#E056B5',
                            },
                        },
                    },
                }}
            >
                <Body className="bg-slate-950 font-sans text-slate-100 my-auto mx-auto font-sans px-2">
                    <Container className="border border-solid border-slate-800 rounded-xl mx-auto my-[40px] max-w-[465px] bg-slate-900/50 p-[20px]">
                        <Section className="mt-[32px]">
                            {/* Using text logo if image not available, or placeholder */}
                            <Text className="text-2xl font-bold text-center">
                                <span className="text-slate-100">Xy</span>
                                <span className="text-cyan-400">noxa</span>
                            </Text>
                        </Section>
                        <Section>
                            <Text className="text-[24px] font-normal text-center p-0 my-[30px] mx-0">
                                Passwort zurücksetzen
                            </Text>
                            <Text className="text-[14px] leading-[24px] text-slate-300">
                                Hallo,
                            </Text>
                            <Text className="text-[14px] leading-[24px] text-slate-300">
                                Jemand hat kürzlich eine Änderung Ihres Passworts für Ihr Xynoxa Cloud Konto angefordert. Wenn Sie dies waren, können Sie hier ein neues Passwort festlegen:
                            </Text>
                            <Section className="text-center mt-[32px] mb-[32px]">
                                <Button
                                    className="bg-cyan-500 rounded text-slate-950 text-[12px] font-semibold no-underline text-center px-5 py-3"
                                    href={resetLink}
                                >
                                    Passwort zurücksetzen
                                </Button>
                            </Section>
                            <Text className="text-[14px] leading-[24px] text-slate-300">
                                Wenn Sie diese Änderung nicht angefordert haben, können Sie diese E-Mail ignorieren.
                            </Text>
                        </Section>
                        <Hr className="border border-solid border-slate-800 my-[26px] mx-0 w-full" />
                        <Text className="text-[12px] leading-[24px] text-slate-500">
                            Xynoxa Cloud System
                        </Text>
                        <Text className="text-[12px] leading-[24px] text-slate-600">
                            © {new Date().getFullYear()} Christin Löhner. All rights reserved.
                        </Text>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
}
