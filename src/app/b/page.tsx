'use client';

import React, { useEffect, useMemo } from "react";

const DEFAULT_DESTINO = "https://novaconta.owlpag.tech/coop-edu";

function isWhatsApp(userAgent: string) {
    return /WhatsApp/i.test(userAgent);
}

function isAndroid(userAgent: string) {
    return /Android/i.test(userAgent);
}

function isIOS(userAgent: string) {
    return /iPhone|iPad|iPod/i.test(userAgent);
}

const RedirectPage: React.FC = () => {
    const destino = useMemo(() => {
        if (typeof window === "undefined") return DEFAULT_DESTINO;

        const params = new URLSearchParams(window.location.search);
        const url = params.get("url");

        // segurança básica contra injeção
        if (url && /^https?:\/\//i.test(url)) {
            return url;
        }

        return DEFAULT_DESTINO;
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const ua = navigator.userAgent;

        if (!isWhatsApp(ua)) {
            window.location.href = destino;
            return;
        }

        // tenta abrir automaticamente
        const timer = setTimeout(() => {
            abrirExterno(destino, ua);
        }, 500);

        return () => clearTimeout(timer);
    }, [destino]);

    const abrirExterno = (url: string, userAgent?: string) => {
        const ua = userAgent || navigator.userAgent;

        if (isAndroid(ua)) {
            const cleanUrl = url.replace(/^https?:\/\//, "");
            window.location.href = `intent://${cleanUrl}#Intent;scheme=https;package=com.android.chrome;end;`;
        } else if (isIOS(ua)) {
            window.open(url, "_blank");
        } else {
            window.location.href = url;
        }
    };

    return (
        <div style={styles.body}>
            <div style={styles.container}>
                <h1>Estamos abrindo seu link</h1>
                <p>Se não abrir automaticamente, toque no botão abaixo:</p>

                <button
                    style={styles.button}
                    onClick={() => abrirExterno(destino)}
                >
                    Abrir no navegador externo
                </button>

                <div style={styles.instructions}>
                    <p>
                        Caso não funcione:<br />
                        • Toque nos três pontos (⋮)<br />
                        • Selecione "Abrir no navegador"
                    </p>
                </div>
            </div>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    body: {
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#f4f4f4",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        margin: 0,
        textAlign: "center",
        padding: 20,
    },
    container: {
        background: "#fff",
        padding: 30,
        borderRadius: 12,
        boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
        maxWidth: 400,
    },
    button: {
        marginTop: 20,
        padding: "12px 20px",
        fontSize: 16,
        border: "none",
        borderRadius: 8,
        backgroundColor: "#25D366",
        color: "#fff",
        cursor: "pointer",
    },
    instructions: {
        marginTop: 15,
        fontSize: 13,
        color: "#777",
    },
};

export default RedirectPage;
