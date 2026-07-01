package org.mtrusov.config;

public class ValidTokenAuthProvider implements AuthProvider {
    @Override
    public String token() {
        return "special-key";
    }
}
