package org.mtrusov.config;

public class NoAuthProvider implements AuthProvider {
    @Override
    public String token() {
        return null;
    }
}
