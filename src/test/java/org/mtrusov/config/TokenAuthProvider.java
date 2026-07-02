package org.mtrusov.config;

public class TokenAuthProvider implements AuthProvider {
    private final String token;

    public TokenAuthProvider(String token) {
        this.token = token;
    }

    @Override
    public String token() {
        return token;
    }
}
