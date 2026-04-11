FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["AeroClaim.Api/AeroClaim.Api.csproj", "AeroClaim.Api/"]
RUN dotnet restore "AeroClaim.Api/AeroClaim.Api.csproj"
COPY . .
WORKDIR "/src/AeroClaim.Api"
RUN dotnet publish "AeroClaim.Api.csproj" -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "AeroClaim.Api.dll"]
